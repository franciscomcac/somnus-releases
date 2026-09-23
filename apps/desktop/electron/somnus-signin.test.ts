import { createHash } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cancelSomnusSignIn, startSomnusSignIn } from './somnus-signin'

// A fake somnus.world: /api/public/app/exchange checks PKCE like the real site.
let site: http.Server
let siteUrl = ''
const issued = new Map<string, { challenge: string; redirect: string }>()

beforeAll(async () => {
  site = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      const entry = issued.get(body.code)
      issued.delete(body.code)
      const ok =
        entry &&
        entry.redirect === body.redirect_uri &&
        createHash('sha256').update(String(body.code_verifier)).digest('base64url') === entry.challenge
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify(
          ok
            ? { api_key: 'sk-test', email: 'a@b.c', gateway_url: 'https://gw.example/v1' }
            : { error: 'invalid_grant', message: 'bad code' }
        )
      )
    })
  })
  await new Promise<void>(r => site.listen(0, '127.0.0.1', () => r()))
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
  process.env.SOMNUS_ACCOUNTS_URL = siteUrl
})

afterAll(() => {
  delete process.env.SOMNUS_ACCOUNTS_URL
  site.close()
})

// Plays the browser + website: sign-in succeeded, redirect back to the app.
function browser(opts: { tamperState?: boolean } = {}) {
  const seen: { location?: null | string; connect?: URL } = {}

  const open = async (url: string) => {
    const connect = new URL(url)
    seen.connect = connect
    const code = `code-${Math.random()}`
    issued.set(code, {
      challenge: connect.searchParams.get('code_challenge')!,
      redirect: connect.searchParams.get('redirect_uri')!
    })
    const cb = new URL(connect.searchParams.get('redirect_uri')!)
    cb.searchParams.set('code', code)
    cb.searchParams.set('state', opts.tamperState ? 'wrong' : connect.searchParams.get('state')!)
    const res = await fetch(cb, { redirect: 'manual' })
    seen.location = res.headers.get('location')
  }

  return { open, seen }
}

describe('Somnus browser sign-in', () => {
  it('opens /app/connect with a loopback redirect and PKCE, then returns the key', async () => {
    const b = browser()
    const result = await startSomnusSignIn(b.open)
    expect(result).toEqual({ ok: true, key: 'sk-test', gatewayUrl: 'https://gw.example/v1', email: 'a@b.c' })
    const c = b.seen.connect!
    expect(c.origin + c.pathname).toBe(`${siteUrl}/app/connect`)
    expect(c.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(c.searchParams.get('code_challenge_method')).toBe('S256')
    expect(b.seen.location).toBe(`${siteUrl}/app/connected`)
  })

  it('ignores a callback with the wrong state', async () => {
    const b = browser({ tamperState: true })
    const pending = startSomnusSignIn(b.open)
    await new Promise(r => setTimeout(r, 200))
    expect(b.seen.location).toBe(`${siteUrl}/app/connected?error=1`)
    cancelSomnusSignIn()
    expect(await pending).toMatchObject({ ok: false, cancelled: true })
  })
})
