import { describe, expect, it } from 'vitest'
import { aiModel } from './ai-model'

const openRouter = { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-1', model: 'openrouter/auto' }

describe('aiModel', () => {
  it('is the assistant key on OpenRouter, the option over the environment', () => {
    expect(aiModel(undefined, { PROTOBASE_ASSISTANT_API_KEY: ' sk-or-1 ' })).toEqual(openRouter)
    expect(aiModel({ apiKey: 'sk-or-2', model: 'anthropic/claude-haiku-5.5' }, { PROTOBASE_ASSISTANT_API_KEY: 'sk-or-1' })).toEqual({ ...openRouter, apiKey: 'sk-or-2', model: 'anthropic/claude-haiku-5.5' })
  })

  it('keeps the model when a chat backend elsewhere is set, and when the chat is off', () => {
    expect(aiModel(undefined, { PROTOBASE_ASSISTANT_URL: 'https://assistant.example.com', PROTOBASE_ASSISTANT_API_KEY: 'sk-or-1' })).toEqual(openRouter)
    expect(aiModel(false, { PROTOBASE_ASSISTANT_API_KEY: 'sk-or-1' })).toEqual(openRouter)
  })

  it('needs a model with an endpoint other than OpenRouter, and is none without a key', () => {
    expect(() => aiModel(undefined, { PROTOBASE_ASSISTANT_API_KEY: 'key', PROTOBASE_ASSISTANT_BASE_URL: 'http://localhost:11434/v1' })).toThrow('PROTOBASE_ASSISTANT_MODEL (or options.assistant.model) is required')
    expect(aiModel(undefined, { PROTOBASE_ASSISTANT_MODEL: 'x' })).toBeUndefined()
    expect(aiModel(undefined, {})).toBeUndefined()
  })
})
