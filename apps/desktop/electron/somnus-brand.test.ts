import assert from 'node:assert/strict'
import test from 'node:test'

import { isProviderCredentialEnv, scrubProviderCredentialsFromEnv } from './somnus-brand'

test('provider keys and base URLs are recognised', () => {
  for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'anthropic_auth_token']) {
    assert.equal(isProviderCredentialEnv(name), true, name)
  }
  for (const name of ['PATH', 'HERMES_HOME', 'GITHUB_TOKEN', 'OPENAI', 'HOME', 'TERMINAL_TIMEOUT']) {
    assert.equal(isProviderCredentialEnv(name), false, name)
  }
})

test('scrub removes only provider credentials', () => {
  const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'x', OPENAI_BASE_URL: 'y', PATH: '/bin', HERMES_HOME: '/h' }
  const removed = scrubProviderCredentialsFromEnv(env)
  assert.deepEqual(removed.sort(), ['ANTHROPIC_API_KEY', 'OPENAI_BASE_URL'])
  assert.deepEqual(env, { PATH: '/bin', HERMES_HOME: '/h' })
})
