// Somnus distribution constants for the renderer (mirror of electron/somnus-brand.ts).

export const SOMNUS_GATEWAY_URL = 'https://gateway-production-c837.up.railway.app/v1'

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
