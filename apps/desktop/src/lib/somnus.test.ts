import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isSomnusProvider, somnusOnlyModelOptions } from './somnus'

const g = globalThis as { __SOMNUS_ALLOW_ALL_PROVIDERS__?: boolean }

describe('Somnus account-only model lists', () => {
  let prev: boolean | undefined

  beforeEach(() => {
    prev = g.__SOMNUS_ALLOW_ALL_PROVIDERS__
    g.__SOMNUS_ALLOW_ALL_PROVIDERS__ = false
  })
  afterEach(() => {
    g.__SOMNUS_ALLOW_ALL_PROVIDERS__ = prev
  })

  it('keeps only rows served by the Somnus gateway', () => {
    const result = somnusOnlyModelOptions({
      providers: [
        { slug: 'anthropic', name: 'Anthropic', models: ['claude-opus-5'] },
        { slug: 'openai-api', name: 'OpenAI API', models: ['gpt-6-sol'] },
        { slug: 'copilot', name: 'GitHub Copilot', models: ['gpt-5'] },
        { slug: 'custom:gateway-production-c837.up.railway.app', name: 'gateway-production-c837.up.railway.app', models: ['claude-sonnet-5'] },
        { slug: 'custom', name: 'Custom endpoint', api_url: 'https://gateway-production-c837.up.railway.app/v1', models: ['deepseek-v4-flash'] },
        { slug: 'custom:other', name: 'Other', api_url: 'https://api.oneprovider.dev/v1', models: ['x'] }
      ]
    })

    expect(result.providers?.map(p => p.slug)).toEqual(['custom:gateway-production-c837.up.railway.app', 'custom'])
  })

  it('recognises the Somnus custom provider alias', () => {
    expect(isSomnusProvider({ slug: 'custom:somnus', name: 'Somnus' })).toBe(true)
    expect(isSomnusProvider({ slug: 'openrouter', name: 'OpenRouter' })).toBe(false)
  })
})
