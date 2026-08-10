"""LLM access layer.

Provider settings (endpoint, model, key) come from the active
``core.models.AIProviderConfig`` row and are resolved **per call**, so
switching models from the admin or the API takes effect on the next request
without a restart. If no row exists — or the table has not been migrated yet,
or Django is not configured in this process — the environment variables that
used to be the only source of truth are used instead.

The previous version read ``os.environ`` in ``__init__`` on a module-level
singleton, which froze the configuration at import time.
"""

import os
import json
import logging
import re
from dataclasses import dataclass
from typing import AsyncGenerator

from asgiref.sync import sync_to_async
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
)

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

logger = logging.getLogger("jaryan.ai")

ENV_FALLBACK_BASE_URL = "https://api.openai.com/v1"
ENV_FALLBACK_MODEL = "gpt-4o"


@dataclass(frozen=True)
class ResolvedProvider:
    """The three values needed to make one LLM call, plus where they came from."""

    api_key: str
    base_url: str
    model: str
    source: str  # config name, or "env"

    @property
    def is_usable(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)


def _from_env() -> ResolvedProvider:
    return ResolvedProvider(
        api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
        base_url=os.environ.get("OPENAI_BASE_URL", ENV_FALLBACK_BASE_URL).rstrip("/"),
        model=os.environ.get("OPENAI_MODEL", ENV_FALLBACK_MODEL),
        source="env",
    )


def _from_config(config) -> ResolvedProvider:
    """Build a provider from a config row, filling a blank key from the env.

    A blank ``api_key`` is treated as "use the environment", which lets a
    deployment keep the secret in .env while still switching endpoint and model
    from the database.
    """
    return ResolvedProvider(
        api_key=config.api_key or os.environ.get("EMERGENT_LLM_KEY", ""),
        base_url=(config.base_url or "").rstrip("/"),
        model=config.model,
        source=config.name,
    )


def resolve_provider() -> ResolvedProvider:
    """Active config if there is one, else the environment. Never raises."""
    try:
        from core.models import AIProviderConfig

        config = AIProviderConfig.get_active()
    except Exception:
        # No Django app registry, table not migrated yet, or database
        # unreachable. The env fallback keeps AI calls working in all three
        # cases, so this must not propagate.
        logger.debug("AIProviderConfig unavailable; falling back to environment", exc_info=True)
        return _from_env()

    if config is None:
        return _from_env()
    return _from_config(config)


# The ORM call is blocking, so async callers must not run it on the event loop.
aresolve_provider = sync_to_async(resolve_provider, thread_sensitive=True)


class AIService:
    """Stateless wrapper around an OpenAI-compatible endpoint.

    Holds no provider state: every method resolves the active provider itself,
    which is what makes runtime model switching work.
    """

    def _chat_client(self, provider: ResolvedProvider, session_id: str, system_message: str):
        if not provider.api_key:
            logger.warning(
                "No API key for AI provider %r; requests will likely fail with 401.",
                provider.source,
            )
        return LlmChat(
            api_key=provider.api_key,
            session_id=session_id,
            system_message=system_message,
            base_url=provider.base_url,
        ).with_model("custom", provider.model)

    async def stream_workflow_generation(
        self, session_id: str, message: str
    ) -> AsyncGenerator[str, None]:
        from services.prompts import WORKFLOW_GENERATOR_PROMPT

        provider = await aresolve_provider()
        chat = self._chat_client(provider, session_id, WORKFLOW_GENERATOR_PROMPT)

        async for ev in chat.stream_message(UserMessage(text=message)):
            if isinstance(ev, TextDelta):
                yield ev.content
            elif isinstance(ev, StreamDone):
                break

    @retry(
        stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def ask_ai_json(
        self, session_id: str, system_prompt: str, user_message: str
    ) -> dict:
        """
        Wrapper to strictly enforce JSON outputs from the LLM, with automatic retries on failure.
        Useful for Workflow AI Agent Nodes.
        """
        provider = await aresolve_provider()
        chat = self._chat_client(provider, session_id, system_prompt)

        full_text = ""
        async for ev in chat.stream_message(UserMessage(text=user_message)):
            if isinstance(ev, TextDelta):
                full_text += ev.content
            elif isinstance(ev, StreamDone):
                break

        return self.extract_json_block(full_text)

    def extract_json_block(self, text: str) -> dict:
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if not m:
            m = re.search(r"(\{[\s\S]*\})", text)
            if not m:
                raise ValueError("No JSON block found in AI response")
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON generated by AI: {e}")

    @retry(
        stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    async def extract_data_from_image(self, image_data: str, prompt: str) -> dict:
        """
        Uses Vision API capabilities to extract JSON data from an image.
        image_data can be a base64 data URI or a standard URL.

        Note that this sends whatever model the active config names; a
        text-only model will reject the image_url content part.
        """
        import httpx

        provider = await aresolve_provider()

        # Ensure it's formatted properly for OpenAI Vision API.
        if not image_data.startswith("http") and not image_data.startswith(
            "data:image"
        ):
            image_data = f"data:image/jpeg;base64,{image_data}"

        messages = [
            {
                "role": "system",
                "content": "You are a helpful data extraction AI. You MUST respond with ONLY valid JSON.",
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_data}},
                ],
            },
        ]

        # trust_env=False to match the streaming client in
        # emergentintegrations/llm/chat.py: ambient HTTP_PROXY/ALL_PROXY vars
        # would otherwise route provider calls through a proxy the operator
        # never chose, and a SOCKS value fails outright unless httpx[socks] is
        # installed. The provider endpoint is configured explicitly, so it
        # should not be silently rewritten by the environment.
        async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
            resp = await client.post(
                f"{provider.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": provider.model,
                    "messages": messages,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            full_text = data["choices"][0]["message"]["content"]

        return self.extract_json_block(full_text)

    async def check_connection(self) -> dict:
        """Send a 1-token completion to prove the active config actually works.

        Returns a plain dict so the API layer can hand it straight to a client:
        ``{ok, provider, model, base_url, detail}``.
        """
        import httpx

        provider = await aresolve_provider()
        result = {
            "provider": provider.source,
            "model": provider.model,
            "base_url": provider.base_url,
        }

        if not provider.is_usable:
            return {**result, "ok": False, "detail": "provider_not_configured"}

        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                resp = await client.post(
                    f"{provider.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {provider.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": provider.model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                    },
                )
        except httpx.HTTPError as e:
            return {**result, "ok": False, "detail": f"connection_error: {e}"}

        if resp.status_code >= 400:
            # Body is truncated because provider errors sometimes echo the key.
            return {
                **result,
                "ok": False,
                "detail": f"http_{resp.status_code}: {resp.text[:200]}",
            }
        return {**result, "ok": True, "detail": "ok"}


ai_service = AIService()
