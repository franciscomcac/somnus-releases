"""Somnus account helpers for the /balance and /dashboard slash commands.

The customer's Somnus key (the gateway key the app signs in with) is sent to the
Somnus accounts service, which answers with the balance, a usage summary and a
one-time link that opens the web dashboard already signed in.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

SOMNUS_ACCOUNTS_URL = "https://accounts-production-3073.up.railway.app"
SOMNUS_GATEWAY_HOSTS = frozenset({"gateway-production-c837.up.railway.app"})
_TIMEOUT_S = 10

__all__ = ["SOMNUS_ACCOUNTS_URL", "SomnusAccountError", "fetch_account_summary", "format_balance",
           "somnus_key"]


class SomnusAccountError(Exception):
    """A user-facing reason the account could not be read."""


@dataclass(frozen=True)
class _Creds:
    key: str
    base_url: str


def _somnus_creds() -> _Creds | None:
    """The Somnus gateway key the agent is using, or None when not signed in to Somnus."""
    try:
        from hermes_cli.runtime_provider import resolve_runtime_provider
        rt = resolve_runtime_provider()
    except Exception:
        return None
    key = str(rt.get("api_key") or "").strip()
    base_url = str(rt.get("base_url") or "").strip()
    host = (urlparse(base_url).hostname or "").lower()
    if not key or host not in SOMNUS_GATEWAY_HOSTS:
        return None
    return _Creds(key=key, base_url=base_url)


def somnus_key() -> str | None:
    creds = _somnus_creds()
    return creds.key if creds else None


def fetch_account_summary(key: str | None = None) -> dict[str, Any]:
    """POST /api/app/balance. Raises SomnusAccountError with a message fit for the user."""
    key = key or somnus_key()
    if not key:
        raise SomnusAccountError(
            "Somnus isn't signed in to your account yet. Open Settings → Somnus account and sign in.")
    req = urllib.request.Request(
        f"{SOMNUS_ACCOUNTS_URL}/api/app/balance", method="POST", data=b"",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json",
                 "User-Agent": "Somnus-App"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise SomnusAccountError(
                "Your Somnus sign-in has expired. Open Settings → Somnus account and sign in again.") from exc
        if exc.code == 429:
            raise SomnusAccountError("Too many requests. Try again in a minute.") from exc
        raise SomnusAccountError("Your Somnus account is temporarily unavailable. Try again in a minute.") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise SomnusAccountError(
            "Couldn't reach Somnus. Check your internet connection and try again.") from exc


def _usd(n: Any, digits: int = 2) -> str:
    try:
        return f"${float(n):,.{digits}f}"
    except (TypeError, ValueError):
        return "$0.00"


def _small_usd(n: Any) -> str:
    """Two decimals normally; four for sub-cent amounts so small spend isn't shown as $0.00."""
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "$0.00"
    return _usd(v, 4) if 0 < v < 0.01 else _usd(v)


def format_balance(summary: dict[str, Any]) -> str:
    left = summary.get("balance_usd", 0)
    lines = [f"Balance: {_usd(left)} left of {_usd(summary.get('max_budget_usd', 0))} "
             f"({_small_usd(summary.get('spend_usd', 0))} used)"]
    usage = summary.get("usage") or None
    if isinstance(usage, dict):
        lines.append(
            f"Spent today {_small_usd(usage.get('today_usd'))} · last 7 days {_small_usd(usage.get('last_7d_usd'))}"
            f" · last 30 days {_small_usd(usage.get('last_30d_usd'))} ({int(usage.get('requests_30d') or 0):,} requests)")
        top = [m for m in usage.get("top_models") or [] if isinstance(m, dict)]
        if top:
            lines.append("Top models (30 days): " + " · ".join(
                f"{m.get('model')} {_small_usd(m.get('spend_usd'))}" for m in top))
    if summary.get("blocked") or float(left or 0) <= 0.05:
        lines.append("You're out of credit. Top up to keep using Somnus: " + str(summary.get("topup_url") or
                                                                              f"{SOMNUS_ACCOUNTS_URL}/dashboard#buy"))
    elif float(left or 0) < 1:
        lines.append("Running low. Top up any time: " + str(summary.get("topup_url") or ""))
    lines.append("")
    lines.append("Full usage dashboard: " + str(summary.get("dashboard_url") or f"{SOMNUS_ACCOUNTS_URL}/dashboard"))
    lines.append("(or type /dashboard to open it)")
    return "\n".join(lines)
