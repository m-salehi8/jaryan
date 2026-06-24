"""
Compatibility shim for emergentintegrations.llm.chat

Uses OpenRouter (OpenAI-compatible API) instead of Anthropic directly.
Set EMERGENT_LLM_KEY to your OpenRouter API key (starts with sk-or-...).

Free models on OpenRouter you can use:
  - meta-llama/llama-3.1-8b-instruct:free
  - mistralai/mistral-7b-instruct:free
  - google/gemma-2-9b-it:free
  - microsoft/phi-3-mini-128k-instruct:free
"""
from __future__ import annotations

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

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Map old Emergent/Anthropic model names → OpenRouter model
_MODEL_MAP = {
    "claude-sonnet-4-6":              "google/gemma-2-9b-it:free",
    "claude-sonnet-4-5":              "google/gemma-2-9b-it:free",
    "claude-3-5-sonnet-20241022":     "google/gemma-2-9b-it:free",
    "claude-opus-4":                  "google/gemma-2-9b-it:free",
    "claude-haiku-4":                 "google/gemma-2-9b-it:free",
}


class LlmChat:
    # Class-level session store: session_id → list of {role, content}
    _sessions: dict[str, list] = {}

    def __init__(
        self,
        api_key: str,
        session_id: str,
        system_message: str = "",
    ) -> None:
        self._api_key = api_key
        self._session_id = session_id
        self._system_message = system_message
        self._model = "google/gemma-2-9b-it:free"

        if session_id not in LlmChat._sessions:
            LlmChat._sessions[session_id] = []

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self._model = _MODEL_MAP.get(model, "google/gemma-2-9b-it:free")
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

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://raahkar.app",
                    "X-Title": "Raahkar",
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
