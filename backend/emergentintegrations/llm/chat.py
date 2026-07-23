"""
Compatibility shim for emergentintegrations.llm.chat

Uses an OpenAI-compatible API endpoint.
Configure via:
  - api_key  → passed from server.py (EMERGENT_LLM_KEY env var)
  - base_url → OPENAI_BASE_URL env var (default: http://localhost:20128/v1)
  - model    → set via with_model() or OPENAI_MODEL env var
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import AsyncIterator

import httpx
import json

# ── Public data types ─────────────────────────────────────────────────────────


@dataclass
class UserMessage:
    text: str


@dataclass
class TextDelta:
    content: str


@dataclass
class StreamDone:
    pass


# ── LlmChat ───────────────────────────────────────────────────────────────────

_DEFAULT_BASE = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
_DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "cf/@cf/moonshotai/kimi-k2.5")


class LlmChat:
    # Class-level session store: session_id → list of {role, content}
    _sessions: dict[str, list] = {}

    def __init__(
        self,
        api_key: str,
        session_id: str,
        system_message: str = "",
        base_url: str = _DEFAULT_BASE,
    ) -> None:
        self._api_key = api_key
        self._session_id = session_id
        self._system_message = system_message
        self._base_url = base_url.rstrip("/")
        self._model = _DEFAULT_MODEL

        if session_id not in LlmChat._sessions:
            LlmChat._sessions[session_id] = []

    def with_model(self, provider: str, model: str) -> "LlmChat":
        """Override the model. Provider is ignored (we use one endpoint)."""
        # If the caller passes a well-known Anthropic model name, keep default.
        # Otherwise use the model string verbatim.
        anthropic_aliases = {
            "claude-sonnet-4-6",
            "claude-sonnet-4-5",
            "claude-3-5-sonnet-20241022",
            "claude-opus-4",
            "claude-haiku-4",
        }
        if model not in anthropic_aliases:
            self._model = model
        # If it IS an Anthropic alias, keep the env-configured default model
        return self

    async def stream_message(
        self, message: UserMessage
    ) -> AsyncIterator[TextDelta | StreamDone]:
        history = LlmChat._sessions[self._session_id]
        history.append({"role": "user", "content": message.text})

        messages = []
        if self._system_message:
            messages.append({"role": "system", "content": self._system_message})
        messages.extend(history)

        full_response = ""

        async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": messages,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            full_response += delta
                            yield TextDelta(content=delta)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

        history.append({"role": "assistant", "content": full_response})
        yield StreamDone()
