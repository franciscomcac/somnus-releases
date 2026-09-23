"""Somnus account helpers for the /balance and /dashboard slash commands.

The customer's Somnus key (the gateway key the app signs in with) is sent to the
Somnus accounts service, which answers with the balance, a usage summary and a
one-time link that opens the web dashboard already signed in.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

# The Somnus accounts website. SOMNUS_ACCOUNTS_URL overrides it (testing a new site).
SOMNUS_ACCOUNTS_URL = (os.environ.get("SOMNUS_ACCOUNTS_URL") or "https://accounts-production-3073.up.railway.app").rstrip("/")
SOMNUS_GATEWAY_HOSTS = frozenset({"gateway-production-c837.up.railway.app"})
_TIMEOUT_S = 10

__all__ = ["SOMNUS_ACCOUNTS_URL", "SomnusAccountError", "fetch_account_summary", "fetch_public_account",
           "format_balance", "sign_out_config", "somnus_key"]


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


_NOT_SIGNED_IN = "Somnus isn't signed in to your account yet. Open Settings → Somnus account and sign in."


def _request(path: str, key: str, method: str) -> dict[str, Any]:
    req = urllib.request.Request(
        f"{SOMNUS_ACCOUNTS_URL}{path}", method=method, data=b"" if method == "POST" else None,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json",
                 "User-Agent": "Somnus-App"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_public_account(key: str | None = None) -> dict[str, Any]:
    """GET /api/public/account (the shape both the accounts service and somnus.world serve)."""
    key = key or somnus_key()
    if not key:
        raise SomnusAccountError(_NOT_SIGNED_IN)
    try:
        return _request("/api/public/account", key, "GET")
    except urllib.error.HTTPError as exc:
        _raise_http(exc)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise SomnusAccountError(
            "Couldn't reach Somnus. Check your internet connection and try again.") from exc
    raise AssertionError("unreachable")


def public_balance(acct: dict[str, Any]) -> float:
    """USD left, from either shape: {balance} (somnus.world) or {credit, credit_cents}."""
    for k in ("balance", "credit"):
        v = acct.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return float(acct.get("credit_cents") or 0) / 100


def _from_public(acct: dict[str, Any]) -> dict[str, Any]:
    """Map /api/public/account onto the /api/app/balance shape format_balance() expects."""
    cents = lambda k: float(acct.get(k) or 0) / 100  # noqa: E731
    left = public_balance(acct)
    has_budget = isinstance(acct.get("max_budget"), (int, float))
    return {
        "email": acct.get("email"),
        "balance_usd": left,
        "max_budget_usd": float(acct["max_budget"]) if has_budget else None,
        "spend_usd": float(acct.get("spend") or 0) if has_budget else None,
        "blocked": bool(acct.get("blocked")) or left <= 0,
        "usage": {"last_30d_usd": cents("spend_cents_30d"), "requests_30d": acct.get("requests_30d") or 0},
        "dashboard_url": acct.get("dashboard_url") or f"{SOMNUS_ACCOUNTS_URL}/dashboard",
        "topup_url": acct.get("top_up_url"),
    }


def _raise_http(exc: urllib.error.HTTPError):
    if exc.code == 401:
        raise SomnusAccountError(
            "Your Somnus sign-in has expired. Open Settings → Somnus account and sign in again.") from exc
    if exc.code == 429:
        raise SomnusAccountError("Too many requests. Try again in a minute.") from exc
    raise SomnusAccountError("Your Somnus account is temporarily unavailable. Try again in a minute.") from exc


def fetch_account_summary(key: str | None = None) -> dict[str, Any]:
    """POST /api/app/balance (falls back to /api/public/account on sites without it).
    Raises SomnusAccountError with a message fit for the user."""
    key = key or somnus_key()
    if not key:
        raise SomnusAccountError(_NOT_SIGNED_IN)
    try:
        return _request("/api/app/balance", key, "POST")
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 405):
            return _from_public(fetch_public_account(key))
        _raise_http(exc)
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
    if summary.get("max_budget_usd") is not None:
        lines = [f"Balance: {_usd(left)} left of {_usd(summary.get('max_budget_usd', 0))} "
                 f"({_small_usd(summary.get('spend_usd', 0))} used)"]
    else:
        lines = [f"Balance: {_usd(left)} left"]
    usage = summary.get("usage") or None
    if isinstance(usage, dict):
        if "today_usd" in usage:
            lines.append(
                f"Spent today {_small_usd(usage.get('today_usd'))} · last 7 days {_small_usd(usage.get('last_7d_usd'))}"
                f" · last 30 days {_small_usd(usage.get('last_30d_usd'))} ({int(usage.get('requests_30d') or 0):,} requests)")
        else:
            lines.append(f"Last 30 days {_small_usd(usage.get('last_30d_usd'))} "
                         f"({int(usage.get('requests_30d') or 0):,} requests)")
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


def sign_out_config(config: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Remove the Somnus key from a loaded config (model.api_key and any provider entry that
    points at the Somnus gateway). Returns (config, changed). The key itself stays valid on
    the account: signing out only disconnects this computer."""
    keys: set[str] = set()

    def _is_gateway(url: Any) -> bool:
        return isinstance(url, str) and (urlparse(url.strip()).hostname or "").lower() in SOMNUS_GATEWAY_HOSTS

    def _collect(node: Any) -> None:
        if isinstance(node, dict):
            if _is_gateway(node.get("base_url")):
                for k in ("api_key", "api"):
                    if isinstance(node.get(k), str) and node[k].strip():
                        keys.add(node[k].strip())
            for v in node.values():
                _collect(v)
        elif isinstance(node, list):
            for v in node:
                _collect(v)

    _collect(config)
    if not keys:
        return config, False

    def _strip(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: _strip(v) for k, v in node.items()
                    if not (isinstance(v, str) and v.strip() in keys)}
        if isinstance(node, list):
            return [_strip(v) for v in node]
        return node

    return _strip(config), True
