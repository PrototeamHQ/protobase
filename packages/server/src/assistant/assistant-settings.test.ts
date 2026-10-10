import { describe, expect, it } from 'vitest'
import { assistantSettings, seesAssistant } from './assistant-settings'

describe('assistantSettings', () => {
  it('is an external backend when a URL is set, the option over the environment, without a trailing slash', () => {
    expect(assistantSettings({ url: 'https://assistant.example.com/apps/1/' }, { PROTOBASE_ASSISTANT_URL: 'https://other.example.com' })).toEqual({ kind: 'external', url: 'https://assistant.example.com/apps/1' })
    expect(assistantSettings(undefined, { PROTOBASE_ASSISTANT_URL: ' http://localhost:4000 ', PROTOBASE_ASSISTANT_API_KEY: 'key' })).toEqual({ kind: 'external', url: 'http://localhost:4000' })
  })

  it('is the built-in assistant on OpenRouter when only a key is set', () => {
    expect(assistantSettings(undefined, { PROTOBASE_ASSISTANT_API_KEY: 'sk-or-1' })).toEqual({ kind: 'built-in', model: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-1', model: 'openrouter/auto' }, chats: '.protobase/chats' })
    expect(assistantSettings({ model: 'anthropic/claude-sonnet-5.5' }, { PROTOBASE_ASSISTANT_API_KEY: 'sk-or-1' })).toMatchObject({ model: { model: 'anthropic/claude-sonnet-5.5' } })
  })

  it('keeps conversations in the chats directory given, the option over the environment', () => {
    expect(assistantSettings(undefined, { PROTOBASE_ASSISTANT_API_KEY: 'key', PROTOBASE_ASSISTANT_CHATS: '/var/lib/chats' })).toMatchObject({ chats: '/var/lib/chats' })
    expect(assistantSettings({ chats: 'data/chats' }, { PROTOBASE_ASSISTANT_API_KEY: 'key', PROTOBASE_ASSISTANT_CHATS: '/var/lib/chats' })).toMatchObject({ chats: 'data/chats' })
  })

  it('takes another OpenAI-compatible endpoint, which needs a model', () => {
    const env = { PROTOBASE_ASSISTANT_API_KEY: 'key', PROTOBASE_ASSISTANT_BASE_URL: 'http://localhost:11434/v1/' }
    expect(assistantSettings(undefined, { ...env, PROTOBASE_ASSISTANT_MODEL: 'llama3.3' })).toEqual({ kind: 'built-in', model: { baseUrl: 'http://localhost:11434/v1', apiKey: 'key', model: 'llama3.3' }, chats: '.protobase/chats' })
    expect(() => assistantSettings(undefined, env)).toThrow('PROTOBASE_ASSISTANT_MODEL (or options.assistant.model) is required with an endpoint other than OpenRouter')
  })

  it('is off without a URL or a key, or when the option is false', () => {
    expect(assistantSettings(undefined, {})).toBeUndefined()
    expect(assistantSettings(undefined, { PROTOBASE_ASSISTANT_URL: '', PROTOBASE_ASSISTANT_MODEL: 'x' })).toBeUndefined()
    expect(assistantSettings(false, { PROTOBASE_ASSISTANT_URL: 'https://assistant.example.com' })).toBeUndefined()
  })

  it('refuses a value that is no http(s) URL, naming where it came from', () => {
    expect(() => assistantSettings(undefined, { PROTOBASE_ASSISTANT_URL: 'assistant.example.com' })).toThrow('PROTOBASE_ASSISTANT_URL is not a URL')
    expect(() => assistantSettings({ url: 'ftp://assistant.example.com' }, {})).toThrow('options.assistant.url must start with https:// or http://, not ftp://')
    expect(() => assistantSettings({ apiKey: 'key', baseUrl: 'file:///tmp' }, {})).toThrow('options.assistant.baseUrl must start with https:// or http://')
  })
})

it('seesAssistant: admin or ai', () => {
  expect([['admin'], ['ai'], ['sales', 'ai'], ['sales'], []].map(seesAssistant)).toEqual([true, true, true, false, false])
})
