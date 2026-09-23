// Somnus: "Sign in with Somnus" for the desktop app.
//
// Device pairing (the same protocol somnus.world and the Somnus accounts
// service both speak):
//   1. POST <accounts>/api/public/device/start {label}
//        -> {device_code, user_code, verification_url_complete, interval, expires_in}
//   2. The app shows user_code and opens verification_url_complete in the
//      browser; the customer signs in there (if needed) and clicks "Sign in".
//   3. The app polls POST <accounts>/api/public/device/poll {device_code}
//        202 pending | 200 {api_key, email, gateway_url?} | 403 denied | 404/410 gone
// No deep link is involved, so it works even when the browser refuses to open
// somnus:// links. Only one sign-in is in flight at a time; a new start()
// supersedes the old one.

import os from 'node:os'

import { SOMNUS } from './somnus-brand'

export type SomnusSignInResult =
  | { ok: true; key: string; gatewayUrl: string; email: string }
  | { ok: false; message: string; cancelled?: boolean }

export interface SomnusSignInCode {
  userCode: string
  url: string
}

interface Pending {
  id: number
  url: string
  resolve: (result: SomnusSignInResult) => void
  timer: ReturnType<typeof setTimeout> | null
}

const REQUEST_TIMEOUT_MS = 15_000
const MAX_POLL_INTERVAL_S = 10

let pending: null | Pending = null
let nextId = 1

function settle(result: SomnusSignInResult) {
  const current = pending

  if (!current) {
    return
  }

  pending = null

  if (current.timer) {
    clearTimeout(current.timer)
  }

  current.resolve(result)
}

export function somnusAccountsUrl(): string {
  return (process.env.SOMNUS_ACCOUNTS_URL || SOMNUS.accountsUrl).replace(/\/+$/, '')
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${somnusAccountsUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Somnus-App' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

  return { status: res.status, json }
}

function deviceLabel(): string {
  const host = os.hostname().replace(/\.local$/i, '').trim()
  const kind = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'Mac' : 'Linux'

  return host ? `${host} (${kind})` : `${kind} computer`
}

export function startSomnusSignIn(
  openExternal: (url: string) => Promise<void> | void,
  onCode: (code: SomnusSignInCode) => void
): Promise<SomnusSignInResult> {
  settle({ ok: false, cancelled: true, message: 'Superseded by a new sign-in.' })

  const id = nextId++

  return new Promise<SomnusSignInResult>(resolve => {
    pending = { id, url: '', resolve, timer: null }
    void run(id, openExternal, onCode)
  })
}

async function run(
  id: number,
  openExternal: (url: string) => Promise<void> | void,
  onCode: (code: SomnusSignInCode) => void
) {
  const alive = () => pending?.id === id

  let start: { status: number; json: Record<string, unknown> }

  try {
    start = await postJson('/api/public/device/start', { label: deviceLabel() })
  } catch {
    if (alive()) {
      settle({ ok: false, message: 'Could not reach Somnus. Check your internet connection.' })
    }

    return
  }

  if (!alive()) {
    return
  }

  const deviceCode = typeof start.json.device_code === 'string' ? start.json.device_code : ''
  const userCode = typeof start.json.user_code === 'string' ? start.json.user_code : ''

  const url =
    typeof start.json.verification_url_complete === 'string'
      ? start.json.verification_url_complete
      : `${somnusAccountsUrl()}/link`

  if (start.status !== 200 || !deviceCode || !userCode) {
    settle({
      ok: false,
      message:
        start.status === 429
          ? 'Too many sign-in attempts. Wait a few minutes and try again.'
          : 'Somnus sign-in is temporarily unavailable. Try again in a minute.'
    })

    return
  }

  pending!.url = url
  onCode({ userCode, url })
  Promise.resolve(openExternal(url)).catch(() => undefined)

  const expiresAt = Date.now() + Math.max(60, Number(start.json.expires_in) || 900) * 1000
  let interval = Math.min(MAX_POLL_INTERVAL_S, Math.max(1, Number(start.json.interval) || 3))

  const poll = async () => {
    if (!alive()) {
      return
    }

    if (Date.now() > expiresAt) {
      settle({ ok: false, message: 'The sign-in code expired. Click Sign in to get a new one.' })

      return
    }

    try {
      const { status, json } = await postJson('/api/public/device/poll', { device_code: deviceCode })

      if (!alive()) {
        return
      }

      if (status === 200 && typeof json.api_key === 'string' && json.api_key) {
        settle({
          ok: true,
          key: json.api_key,
          gatewayUrl: typeof json.gateway_url === 'string' && json.gateway_url ? json.gateway_url : SOMNUS.gatewayUrl,
          email: typeof json.email === 'string' ? json.email : ''
        })

        return
      }

      if (status === 403 || json.status === 'denied') {
        settle({ ok: false, message: 'Sign-in was cancelled in the browser.' })

        return
      }

      if (status === 404 || status === 410 || json.status === 'expired' || json.status === 'not_found') {
        settle({ ok: false, message: 'The sign-in code expired. Click Sign in to get a new one.' })

        return
      }

      if (status === 429) {
        interval = Math.min(MAX_POLL_INTERVAL_S, interval * 2)
      }
    } catch {
      // Network blip: keep polling until the code expires.
    }

    if (alive()) {
      pending!.timer = setTimeout(() => void poll(), interval * 1000)
    }
  }

  pending!.timer = setTimeout(() => void poll(), interval * 1000)
}

/** Opens the approval page again (the customer closed the tab, or the browser didn't open). */
export function reopenSomnusSignIn(openExternal: (url: string) => Promise<void> | void): boolean {
  if (!pending?.url) {
    return false
  }

  Promise.resolve(openExternal(pending.url)).catch(() => undefined)

  return true
}

export function cancelSomnusSignIn() {
  settle({ ok: false, cancelled: true, message: 'Sign-in cancelled.' })
}

/**
 * somnus://auth was the callback of the older browser handoff. Sign-in no longer
 * uses it, but the link is still swallowed here so a stale one never reaches
 * the renderer as an unknown deep link.
 */
export function handleSomnusAuthDeepLink(kind: string, _params: Record<string, string>): boolean {
  return kind === 'auth'
}
