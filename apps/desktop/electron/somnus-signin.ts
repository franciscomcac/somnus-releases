// Somnus: "Sign in with Somnus" for the desktop app.
//
// Browser sign-in for native apps (RFC 8252: loopback redirect + PKCE S256):
//   1. The app listens on http://127.0.0.1:<random port>/callback and opens
//      <site>/app/connect?redirect_uri&state&code_challenge&code_challenge_method=S256
//   2. The customer signs in (or signs up) on the website; the site sends the
//      browser straight back to the loopback URL with ?code&state. No codes to
//      type or compare, no somnus:// link for the browser to block.
//   3. The app answers the browser with a redirect to <site>/app/connected and
//      POSTs {code, code_verifier, redirect_uri} to <site>/api/public/app/exchange,
//      which returns the account's gateway key once.
// Only one sign-in runs at a time; a new start() supersedes the old one.

import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { SOMNUS } from './somnus-brand'

export type SomnusSignInResult =
  | { ok: true; key: string; gatewayUrl: string; email: string }
  | { ok: false; message: string; cancelled?: boolean }

interface Pending {
  id: number
  url: string
  server: http.Server | null
  resolve: (result: SomnusSignInResult) => void
  timer: ReturnType<typeof setTimeout> | null
}

const SIGN_IN_TIMEOUT_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000

let pending: null | Pending = null
let nextId = 1

const b64url = (buf: Buffer) => buf.toString('base64url')

export function somnusAccountsUrl(): string {
  return (process.env.SOMNUS_ACCOUNTS_URL || SOMNUS.accountsUrl).replace(/\/+$/, '')
}

function settle(result: SomnusSignInResult) {
  const current = pending

  if (!current) {
    return
  }

  pending = null

  if (current.timer) {
    clearTimeout(current.timer)
  }

  // Let the browser's redirect response flush before the listener goes away.
  const server = current.server
  setTimeout(() => server?.close(), 2000).unref?.()
  current.resolve(result)
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

async function exchange(code: string, verifier: string, redirectUri: string): Promise<SomnusSignInResult> {
  try {
    const res = await fetch(`${somnusAccountsUrl()}/api/public/app/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Somnus-App' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok || typeof body.api_key !== 'string' || !body.api_key) {
      return { ok: false, message: String(body.message || 'Sign-in did not finish. Try again.') }
    }

    return {
      ok: true,
      key: body.api_key,
      gatewayUrl: typeof body.gateway_url === 'string' && body.gateway_url ? body.gateway_url : SOMNUS.gatewayUrl,
      email: typeof body.email === 'string' ? body.email : ''
    }
  } catch {
    return { ok: false, message: 'Could not reach Somnus. Check your internet connection.' }
  }
}

export async function startSomnusSignIn(
  openExternal: (url: string) => Promise<void> | void
): Promise<SomnusSignInResult> {
  settle({ ok: false, cancelled: true, message: 'Superseded by a new sign-in.' })

  const id = nextId++
  const state = b64url(randomBytes(32))
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const site = somnusAccountsUrl()
  let redirectUri = ''
  let handled = false

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (url.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')

      return
    }

    const code = url.searchParams.get('code') || ''
    const ok = !handled && pending?.id === id && Boolean(code) && url.searchParams.get('state') === state
    // Send the browser to the website's own "you're signed in" page.
    res
      .writeHead(302, { Location: `${site}/app/connected${ok ? '' : '?error=1'}`, 'Cache-Control': 'no-store' })
      .end()

    if (!ok) {
      return
    }

    handled = true
    void exchange(code, verifier, redirectUri).then(result => {
      if (pending?.id === id) {
        settle(result)
      }
    })
  })

  let port: number

  try {
    port = await listen(server)
  } catch {
    return { ok: false, message: 'Somnus could not start the sign-in. Restart Somnus and try again.' }
  }

  redirectUri = `http://127.0.0.1:${port}/callback`

  const connectUrl = new URL('/app/connect', site)
  connectUrl.searchParams.set('redirect_uri', redirectUri)
  connectUrl.searchParams.set('state', state)
  connectUrl.searchParams.set('code_challenge', challenge)
  connectUrl.searchParams.set('code_challenge_method', 'S256')

  return new Promise<SomnusSignInResult>(resolve => {
    pending = {
      id,
      url: connectUrl.toString(),
      server,
      resolve,
      timer: setTimeout(() => settle({ ok: false, message: 'Sign-in timed out. Click Sign in to try again.' }), SIGN_IN_TIMEOUT_MS)
    }

    Promise.resolve(openExternal(connectUrl.toString())).catch(() =>
      settle({ ok: false, message: 'Could not open your browser.' })
    )
  })
}

/** Opens the sign-in page again (the customer closed the tab, or the browser didn't open). */
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
 * somnus://auth was the callback of an older sign-in. It is still swallowed
 * here so a stale link never reaches the renderer as an unknown deep link.
 */
export function handleSomnusAuthDeepLink(kind: string, _params: Record<string, string>): boolean {
  return kind === 'auth'
}
