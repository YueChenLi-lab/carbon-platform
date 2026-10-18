# -*- coding: utf-8 -*-
"""
LLMService — the single, unified entry point for all model calls.

Spec requirement: "禁止 Agent 直接调用 API，统一通过 LLMService".
No agent file should import `requests`/`openai` and hit DeepSeek directly;
every agent calls `llm_service.chat(...)` instead. This keeps retries,
token accounting, and logging in one place, and means swapping DeepSeek
for Qwen/Kimi/GPT later is a one-file change.
"""
import os
import time
import json
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional

import requests

logger = logging.getLogger("agent.llm")
logging.basicConfig(level=logging.INFO)


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    call_count: int = 0

    def add(self, usage: dict):
        self.prompt_tokens += usage.get("prompt_tokens", 0)
        self.completion_tokens += usage.get("completion_tokens", 0)
        self.total_tokens += usage.get("total_tokens", 0)
        self.call_count += 1


@dataclass
class LLMConfig:
    api_key: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_API_KEY", ""))
    base_url: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    model: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    timeout: int = 60
    max_retries: int = 3
    retry_backoff_seconds: float = 1.5


class LLMServiceError(RuntimeError):
    pass


class LLMService:
    """
    Thin, provider-agnostic wrapper around DeepSeek's OpenAI-compatible
    /chat/completions endpoint. Swap providers by changing base_url/model
    (or subclassing) — agents never need to know which provider is behind
    this class.
    """

    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig()
        self.usage = TokenUsage()

    def _headers(self):
        if not self.config.api_key:
            raise LLMServiceError(
                "DEEPSEEK_API_KEY is not set. Export it as an environment variable "
                "(never hardcode it in source or commit it)."
            )
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 1500,
        response_format_json: bool = False,
    ) -> str:
        """
        messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
        Returns the assistant's text content. Raises LLMServiceError after
        exhausting retries.
        """
        url = f"{self.config.base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format_json:
            payload["response_format"] = {"type": "json_object"}

        last_err = None
        for attempt in range(1, self.config.max_retries + 1):
            try:
                resp = requests.post(
                    url, headers=self._headers(), json=payload, timeout=self.config.timeout
                )
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise LLMServiceError(f"DeepSeek transient error {resp.status_code}: {resp.text[:300]}")
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage", {})
                self.usage.add(usage)
                logger.info(
                    "deepseek call ok attempt=%s tokens=%s total_calls=%s",
                    attempt, usage.get("total_tokens"), self.usage.call_count,
                )
                return data["choices"][0]["message"]["content"]
            except Exception as e:  # noqa: BLE001 - deliberately broad, we retry any failure
                last_err = e
                logger.warning("deepseek call failed attempt=%s/%s err=%s", attempt, self.config.max_retries, e)
                if attempt < self.config.max_retries:
                    time.sleep(self.config.retry_backoff_seconds * attempt)
        raise LLMServiceError(f"DeepSeek call failed after {self.config.max_retries} attempts: {last_err}")

    def chat_json(self, messages: List[Dict[str, str]], **kwargs) -> dict:
        """Convenience wrapper for agents that need structured output."""
        raw = self.chat(messages, response_format_json=True, **kwargs)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            cleaned = raw.strip().strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            return json.loads(cleaned)


# module-level singleton — agents import this, never instantiate their own
llm_service = LLMService()
