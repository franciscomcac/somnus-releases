"""Somnus: send side work (subagents, compaction summaries) to a cheaper model on the Somnus gateway.

Customers pay per token, and side work — searching files for the parent, summarizing old context —
does not need the frontier model the user picked for the main conversation. On the Somnus gateway,
a Claude Sonnet/Opus/Fable parent hands that work to Claude Haiku (about half to a tenth of the price)
unless the user configured a model for it (``delegation.model`` / ``auxiliary.compression.model``,
both of which are checked by the callers before this is consulted). Other routes and cheaper parent
models are left alone.
"""

from __future__ import annotations

from typing import Optional

from utils import base_url_hostname

SOMNUS_GATEWAY_HOSTS = frozenset({"gateway-production-c837.up.railway.app"})
SOMNUS_HELPER_MODEL = "claude-haiku-4-5"
_EXPENSIVE_PREFIXES = ("claude-sonnet", "claude-opus", "claude-fable")


def is_somnus_gateway(base_url: Optional[str]) -> bool:
    return base_url_hostname(base_url or "") in SOMNUS_GATEWAY_HOSTS


def somnus_helper_model(base_url: Optional[str], model: Optional[str]) -> Optional[str]:
    """The cheaper model side work should use for a parent on ``(base_url, model)``, or None to inherit."""
    name = (model or "").strip().lower()
    if not is_somnus_gateway(base_url) or not name.startswith(_EXPENSIVE_PREFIXES):
        return None
    return SOMNUS_HELPER_MODEL
