// Somnus distribution constants for the renderer (mirror of electron/somnus-brand.ts).

export const SOMNUS_GATEWAY_URL = 'https://gateway-production-c837.up.railway.app/v1'
export const SOMNUS_ACCOUNTS_URL = 'https://accounts-production-3073.up.railway.app'

// First available model wins as the default after a customer connects. Cheap,
// fast models first: agent turns send large prompts, so the default decides most
// of a customer's bill. Everything else stays one click away in the model picker.
export const SOMNUS_DEFAULT_MODELS = [
  'deepseek-v4-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gpt-5.6-luna',
  'claude-haiku-4-5',
  'claude-sonnet-5'
]

export function pickSomnusDefaultModel(available: readonly string[]): string {
  return SOMNUS_DEFAULT_MODELS.find(m => available.includes(m)) ?? available[0] ?? ''
}

// Hermes can upload debug bundles to Nous Research. Somnus customers' logs must
// never go to a third party, so every "Send diagnostics" entry point is hidden.
export const SOMNUS_ALLOW_NOUS_DIAGNOSTICS = false as boolean

// Somnus customers only ever use models they pay for through their Somnus
// account. Anything else the engine discovers on the computer (API keys in the
// environment, GitHub Copilot, a stray custom endpoint) is dropped from every
// model list, so no model can be picked that bypasses Somnus billing.
const SOMNUS_GATEWAY_HOST = new URL(SOMNUS_GATEWAY_URL).host.toLowerCase()

interface ProviderRowLike {
  slug?: null | string
  name?: null | string
  aliases?: null | readonly string[]
  api_url?: null | string
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).host.toLowerCase()
  } catch {
    return ''
  }
}

export function isSomnusProvider(row: ProviderRowLike): boolean {
  if (row.api_url && hostOf(row.api_url) === SOMNUS_GATEWAY_HOST) {
    return true
  }

  const names = [row.slug, row.name, ...(row.aliases ?? [])].filter(Boolean).map(v => String(v).toLowerCase())

  return names.some(v => v.includes(SOMNUS_GATEWAY_HOST) || v === 'somnus' || v === 'custom:somnus')
}

// Upstream test suites exercise the multi-provider picker; vitest.setup.ts sets
// this flag so they keep testing upstream mechanics. Never set in the app.
export function somnusAccountOnly(): boolean {
  return !(globalThis as { __SOMNUS_ALLOW_ALL_PROVIDERS__?: boolean }).__SOMNUS_ALLOW_ALL_PROVIDERS__
}

export function somnusOnlyModelOptions<T extends { providers?: null | readonly ProviderRowLike[] }>(result: T): T {
  if (!somnusAccountOnly() || !result || !Array.isArray(result.providers)) {
    return result
  }

  return { ...result, providers: result.providers.filter(isSomnusProvider) }
}
