import { hermesApi, profileScoped } from './client'

// Somnus account (hermes_cli/web_routers/somnus.py). The key never leaves the engine.
export interface SomnusAccount {
  signed_in: boolean
  email?: string
  balance_usd?: number
  blocked?: boolean
  spend_30d_usd?: number
  requests_30d?: number
  top_up_url?: string
  dashboard_url?: string
  /** Set when the account could not be read (offline, or the sign-in expired). */
  error?: string
  expired?: boolean
}

export function getSomnusAccount(profile?: null | string): Promise<SomnusAccount> {
  return hermesApi<SomnusAccount>({ ...profileScoped(profile), path: '/api/somnus/account' })
}

export function signOutOfSomnus(profile?: null | string): Promise<{ ok: boolean }> {
  return hermesApi<{ ok: boolean }>({ ...profileScoped(profile), path: '/api/somnus/sign-out', method: 'POST', body: {} })
}
