// Somnus distribution constants. Every Somnus-specific value the Electron side
// needs lives here so upstream Hermes merges touch as few lines as possible.

export const SOMNUS = {
  appName: 'Somnus',
  // Must match package.json build.appId (Windows AUMID / Start Menu shortcut).
  appId: 'com.somnus.desktop',
  protocol: 'somnus',
  // Data folder name: %LOCALAPPDATA%\somnus on Windows, ~/.somnus elsewhere.
  // Deliberately separate from Hermes so a customer's own Hermes is never touched.
  homeDirName: 'somnus',
  homeDirNamePosix: '.somnus',
  // Public repo that hosts the engine snapshot + install scripts customers download.
  releasesRepo: 'franciscomcac/somnus-releases',
  releasesBranch: 'main',
  // The Somnus gateway every request goes through.
  gatewayUrl: 'https://gateway-production-c837.up.railway.app/v1',
  // Somnus website (somnus.world): sign-up, billing, and the app sign-in.
  accountsUrl: 'https://somnus.world'
} as const

export const SOMNUS_RELEASES_GIT_URL = `https://github.com/${SOMNUS.releasesRepo}.git`
export const SOMNUS_RELEASES_RAW_BASE = `https://raw.githubusercontent.com/${SOMNUS.releasesRepo}`

// Somnus only runs on the customer's Somnus account. Provider keys and base URLs
// that happen to be set on the computer (for another app, an old Hermes setup,
// a CLI) must never reach the engine: it would list those providers and could
// route around Somnus billing. Called once at startup, before any child process
// is spawned, so every engine/tool process inherits the cleaned environment.
const SOMNUS_PROVIDER_ENV_PREFIXES = [
  'ANTHROPIC', 'OPENAI', 'AZURE_OPENAI', 'OPENROUTER', 'GEMINI', 'GOOGLE_GENERATIVE_AI', 'GOOGLE_AI', 'VERTEX',
  'XAI', 'GROK', 'DEEPSEEK', 'MOONSHOT', 'KIMI', 'MISTRAL', 'GROQ', 'TOGETHER', 'FIREWORKS', 'PERPLEXITY',
  'COHERE', 'NOUS', 'DASHSCOPE', 'QWEN', 'ZAI', 'GLM', 'ZHIPU', 'MINIMAX', 'HF', 'HUGGINGFACE', 'CEREBRAS',
  'NVIDIA', 'NIM', 'OLLAMA', 'LMSTUDIO', 'LM_STUDIO', 'COPILOT', 'GITHUB_COPILOT', 'BEDROCK', 'AWS_BEARER_TOKEN',
  'CLAUDE_CODE', 'CODEX', 'LITELLM', 'ONEPROVIDER', 'AI_GATEWAY', 'VERCEL_AI', 'REPLICATE', 'SAMBANOVA', 'NEBIUS',
  'HYPERBOLIC', 'NOVITA', 'CHUTES', 'KILO', 'KILOCODE', 'ARCEE', 'INCEPTION', 'VENICE', 'BASETEN', 'DEEPINFRA'
]

const SOMNUS_PROVIDER_ENV_SUFFIXES = ['_API_KEY', '_API_KEYS', '_KEY', '_BASE_URL', '_API_BASE', '_API_URL', '_AUTH_TOKEN', '_TOKEN', '_ENDPOINT', '_HOST', '_ORG_ID', '_PROJECT']

export function isProviderCredentialEnv(name: string): boolean {
  const key = name.toUpperCase()

  if (key === 'GOOGLE_API_KEY' || key === 'GH_COPILOT_TOKEN') {
    return true
  }

  return SOMNUS_PROVIDER_ENV_PREFIXES.some(
    prefix => key.startsWith(`${prefix}_`) && SOMNUS_PROVIDER_ENV_SUFFIXES.some(suffix => key.endsWith(suffix))
  )
}

export function scrubProviderCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = []

  for (const name of Object.keys(env)) {
    if (isProviderCredentialEnv(name)) {
      delete env[name]
      removed.push(name)
    }
  }

  return removed
}
