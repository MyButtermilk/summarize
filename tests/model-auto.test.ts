import { describe, expect, it } from 'vitest'

import type { SummarizeConfig } from '../src/config.js'
import { buildAutoModelAttempts } from '../src/model-auto.js'

describe('auto model selection', () => {
  it('adds an OpenRouter fallback attempt when OPENROUTER_API_KEY is set', () => {
    const config: SummarizeConfig = {
      auto: { rules: [{ candidates: [{ model: 'openai/gpt-5.2' }] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.some((a) => a.forceOpenRouter)).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5.2')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5.2')).toBe(true)
  })

  it('does not add an OpenRouter fallback when video understanding is required', () => {
    const config: SummarizeConfig = {
      auto: { rules: [{ candidates: [{ model: 'google/gemini-3-flash-preview' }] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'video',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: true,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.every((a) => a.forceOpenRouter === false)).toBe(true)
  })

  it('respects explicit openrouter/... candidates (no native attempt)', () => {
    const config: SummarizeConfig = {
      auto: { rules: [{ candidates: [{ model: 'openrouter/openai/gpt-5-nano' }] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5-nano')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5-nano')).toBe(false)
  })
})

