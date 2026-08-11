"""Thin wrapper over the Anthropic API with strict JSON parsing.

Every caller gets structured data or an exception. No caller ever sees
free-form model prose, which keeps the LLM boundary narrow and testable.
"""
import json
import re
from typing import Any

from ..config import settings


class LLMUnavailable(RuntimeError):
    """Raised when the model cannot be reached or returns unusable output."""


_client: Any = None


def client() -> Any:
    """Imported lazily so the pure logic stays testable without the SDK."""
    global _client
    if not settings.anthropic_api_key:
        raise LLMUnavailable("ANTHROPIC_API_KEY is not set")
    if _client is None:
        try:
            from anthropic import Anthropic
        except ImportError as exc:  # pragma: no cover
            raise LLMUnavailable("anthropic SDK is not installed") from exc
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def complete(content, max_tokens: int = 4000) -> str:
    try:
        message = client().messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": content}],
        )
    except LLMUnavailable:
        raise
    except Exception as exc:  # network, auth, rate limit
        raise LLMUnavailable(str(exc)) from exc
    return "".join(block.text for block in message.content if block.type == "text")


def parse_json(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise LLMUnavailable("Model did not return JSON")
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise LLMUnavailable(f"Malformed JSON from model: {exc}") from exc
