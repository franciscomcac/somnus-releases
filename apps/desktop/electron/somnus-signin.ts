// Somnus: "Sign in with Somnus" for the desktop app.
//
// OAuth-style authorization-code handoff with PKCE against the Somnus accounts
// site (protocol spec: somnus-accounts README, "App handoff protocol"):
//   1. start() opens <accounts>/app/connect?state&redirect=somnus://auth&code_challenge
//   2. the site redirects the browser to somnus://auth?code&state
//   3. handleCallback() checks state and POSTs {code, state, code_verifier} to
//      /api/app/exchange, which returns the customer's gateway key once.
// Only one sign-in is in flight at a time; a new start() supersedes the old one.

import { createHash, randomBytes } from 'node:crypto'

import { SOMNUS } from './somnus-brand'

export type SomnusSignInResult =
  | { ok: true; key: string; gatewayUrl: string; email: string }
  | { ok: false; message: string; cancelled?: boolean }

interface Pending {
  state: string
  verifier: string
  resolve: (result: SomnusSignInResult) => void
  timer: ReturnType<typeof setTimeout>
}

const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

let pending: null | Pending = null

const b64url = (buf: Buffer) => buf.toString('base64url')

function settle(result: SomnusSignInResult) {
  const current = pending

  if (!current) {
    return
  }

  pending = null
  clearTimeout(current.timer)
  current.resolve(result)
}

export function startSomnusSignIn(openExternal: (url: string) => Promise<void> | void): Promise<SomnusSignInResult> {
  settle({ ok: false, cancelled: true, message: 'Superseded by a new sign-in.' })

  const state = b64url(randomBytes(32))
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())

  const url = new URL('/app/connect', SOMNUS.accountsUrl)
  url.searchParams.set('state', state)
  url.searchParams.set('redirect', `${SOMNUS.protocol}://auth`)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return new Promise<SomnusSignInResult>(resolve => {
    pending = {
      state,
      verifier,
      resolve,
      timer: setTimeout(
        () => settle({ ok: false, message: 'Sign-in timed out. Try again.' }),
        SIGN_IN_TIMEOUT_MS
      )
    }

    Promise.resolve(openExternal(url.toString())).catch(() =>
      settle({ ok: false, message: 'Could not open your browser.' })
    )
  })
}

export function cancelSomnusSignIn() {
  settle({ ok: false, cancelled: true, message: 'Sign-in cancelled.' })
}

/** True when the deep link was a Somnus sign-in callback (and was consumed). */
export function handleSomnusAuthDeepLink(kind: string, params: Record<string, string>): boolean {
  if (kind !== 'auth') {
    return false
  }

  const current = pending

  // A callback nobody asked for (or for an older attempt) is ignored.
  if (!current || !params.code || params.state !== current.state) {
    return true
  }

  void exchange(params.code, current)

  return true
}

async function exchange(code: string, current: Pending) {
  try {
    const res = await fetch(new URL('/api/app/exchange', SOMNUS.accountsUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state: current.state, code_verifier: current.verifier })
    })

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (pending !== current) {
      return
    }

    if (!res.ok || typeof body.key !== 'string') {
      settle({ ok: false, message: String(body.message || 'Sign-in failed. Try again.') })

      return
    }

    settle({
      ok: true,
      key: body.key,
      gatewayUrl: typeof body.gateway_url === 'string' ? body.gateway_url : SOMNUS.gatewayUrl,
      email: typeof body.email === 'string' ? body.email : ''
    })
  } catch {
    if (pending === current) {
      settle({ ok: false, message: 'Could not reach Somnus. Check your internet connection.' })
    }
  }
}
