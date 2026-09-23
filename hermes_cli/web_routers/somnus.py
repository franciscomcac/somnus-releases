"""Somnus account routes for the desktop app: who is signed in (with balance) and sign-out.

Sign-in itself happens in the Electron main process (device pairing against the Somnus
website); the key it returns is saved through the normal /api/model/set path.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter

from hermes_cli.web_deps import late
from hermes_cli.web_routers._common import config_write_scope

_log = logging.getLogger("hermes_cli.web_server")
router = APIRouter()

_profile_scope = late("_profile_scope", "hermes_cli.web_server_profiles")
load_config = late("load_config", "hermes_cli.config")
save_config = late("save_config", "hermes_cli.config")


@router.get("/api/somnus/account")
async def somnus_account(profile: Optional[str] = None):
    """{signed_in, email, balance_usd, ...} for Settings → Somnus account. Never returns the key."""
    from hermes_cli import somnus_account as sa

    def _read():
        with _profile_scope(profile):
            key = sa.somnus_key()
        if not key:
            return {"signed_in": False}
        try:
            acct = sa.fetch_public_account(key)
        except sa.SomnusAccountError as exc:
            return {"signed_in": True, "error": str(exc),
                    "expired": "expired" in str(exc).lower(),
                    "dashboard_url": f"{sa.SOMNUS_ACCOUNTS_URL}/dashboard"}
        credit = sa.public_balance(acct)
        return {
            "signed_in": True,
            "email": acct.get("email") or "",
            "balance_usd": float(credit),
            "blocked": bool(acct.get("blocked")) or float(credit) <= 0,
            "spend_30d_usd": (float(acct["spend_cents_30d"]) / 100 if "spend_cents_30d" in acct
                              else float(acct.get("spend") or 0)),
            "requests_30d": int(acct.get("requests_30d") or 0),
            "top_up_url": acct.get("top_up_url") or f"{sa.SOMNUS_ACCOUNTS_URL}/billing",
            "dashboard_url": acct.get("dashboard_url") or f"{sa.SOMNUS_ACCOUNTS_URL}/dashboard",
        }

    return await asyncio.to_thread(_read)


@router.post("/api/somnus/sign-out")
async def somnus_sign_out(profile: Optional[str] = None):
    """Forget the Somnus key on this computer. The account and its credit are untouched."""
    from hermes_cli.somnus_account import sign_out_config

    def _apply():
        with config_write_scope(profile):
            cfg, changed = sign_out_config(load_config())
            if changed:
                save_config(cfg)
            return changed

    changed = await asyncio.to_thread(_apply)
    _log.info("somnus sign-out (key removed: %s)", changed)
    return {"ok": True, "signed_out": True}
