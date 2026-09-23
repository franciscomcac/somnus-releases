// Somnus distribution constants for the renderer (mirror of electron/somnus-brand.ts).

export const SOMNUS_GATEWAY_URL = 'https://gateway-production-c837.up.railway.app/v1'
export const SOMNUS_ACCOUNTS_URL = 'https://somnus.world'
// Where "Top up" goes when the balance runs out (the website asks the customer to sign in if needed).
export const SOMNUS_TOP_UP_URL = `${SOMNUS_ACCOUNTS_URL}/billing`

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

// The Somnus gateway serves every vendor's models under one provider. The model
// picker splits that one long list into recognizable vendor groups.
export interface SomnusVendor {
  key: string
  label: string
  order: number
}

const SOMNUS_VENDORS: ReadonlyArray<SomnusVendor & { match: RegExp }> = [
  { key: 'claude', label: 'Claude', order: 0, match: /^(anthropic\/)?claude/ },
  { key: 'chatgpt', label: 'ChatGPT', order: 1, match: /^(openai\/)?(gpt|o\d|chatgpt|codex)/ },
  { key: 'gemini', label: 'Gemini', order: 2, match: /^(google\/)?(gemini|gemma)/ },
  { key: 'grok', label: 'Grok', order: 3, match: /^(xai\/)?grok/ },
  { key: 'deepseek', label: 'DeepSeek', order: 4, match: /^(deepseek\/)?deepseek/ },
  { key: 'kimi', label: 'Kimi', order: 5, match: /^(moonshot(ai)?\/)?kimi/ },
  { key: 'qwen', label: 'Qwen', order: 6, match: /^(qwen\/)?qwen/ },
  { key: 'glm', label: 'GLM', order: 7, match: /^(z-?ai\/|zhipu\/)?glm/ },
  { key: 'mimo', label: 'MiMo', order: 8, match: /^(xiaomi\/)?mimo/ }
]

const OTHER_VENDOR: SomnusVendor = { key: 'other', label: 'Other', order: 99 }

export function somnusModelVendor(modelId: string): SomnusVendor {
  const id = modelId.trim().toLowerCase()
  const hit = SOMNUS_VENDORS.find(v => v.match.test(id))

  return hit ? { key: hit.key, label: hit.label, order: hit.order } : OTHER_VENDOR
}

// The bundled wake-word model only knows the upstream engine's name; Somnus
// hides the hands-free wake word until a "hey Somnus" model ships.
// (Upstream UI tests still exercise it; vitest.setup.ts sets the test-mode flag.)
export const SOMNUS_WAKE_WORD_ENABLED = Boolean(
  (globalThis as { __SOMNUS_UPSTREAM_TEST_MODE__?: boolean }).__SOMNUS_UPSTREAM_TEST_MODE__
)
