import { describe, expect, it } from 'vitest'
import { runtimeUrl, seesRuntime } from './runtime-settings'

describe('runtimeUrl', () => {
  it('is the URL set, the option over the environment, without a trailing slash', () => {
    expect(runtimeUrl({ url: 'https://cloud.example.com/apps/7/runtime/' }, { PROTOBASE_RUNTIME_URL: 'https://other.example.com' })).toBe('https://cloud.example.com/apps/7/runtime')
    expect(runtimeUrl(undefined, { PROTOBASE_RUNTIME_URL: ' http://localhost:4000/runtime ' })).toBe('http://localhost:4000/runtime')
  })

  it('is off without a URL, or when the option is false', () => {
    expect(runtimeUrl(undefined, {})).toBeUndefined()
    expect(runtimeUrl(undefined, { PROTOBASE_RUNTIME_URL: ' ' })).toBeUndefined()
    expect(runtimeUrl(false, { PROTOBASE_RUNTIME_URL: 'https://cloud.example.com/runtime' })).toBeUndefined()
  })

  it('refuses a value that is no http(s) URL, naming where it came from', () => {
    expect(() => runtimeUrl(undefined, { PROTOBASE_RUNTIME_URL: 'cloud.example.com' })).toThrow('PROTOBASE_RUNTIME_URL is not a URL')
    expect(() => runtimeUrl({ url: 'ftp://cloud.example.com' }, {})).toThrow('options.runtime.url must start with https:// or http://, not ftp://')
  })
})

it('seesRuntime: admin only', () => {
  expect([['admin'], ['sales', 'admin'], ['ai'], []].map(seesRuntime)).toEqual([true, true, false, false])
})
