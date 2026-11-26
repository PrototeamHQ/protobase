import { describe, expect, it } from 'vitest'
import { readOnlyQueriesOn } from './read-only-queries'

const key = { PROTOBASE_ASSISTANT_API_KEY: 'sk-test' }

describe('read-only queries', () => {
  it("run with the built-in assistant's key", () => {
    expect(readOnlyQueriesOn({}, key)).toBe(true)
    expect(readOnlyQueriesOn({ assistant: false }, key)).toBe(false)
    expect(readOnlyQueriesOn({ assistant: { url: 'https://assistant.example.com' } }, key)).toBe(false)
  })

  it("run with the MCP endpoint's sql, without the assistant", () => {
    expect(readOnlyQueriesOn({ mcp: { sql: true } }, {})).toBe(true)
    expect(readOnlyQueriesOn({ assistant: false, mcp: { sql: true } }, {})).toBe(true)
  })

  it('do not run with neither', () => {
    expect(readOnlyQueriesOn({}, {})).toBe(false)
    expect(readOnlyQueriesOn({ mcp: { sql: false } }, {})).toBe(false)
    expect(readOnlyQueriesOn({ mcp: false }, {})).toBe(false)
  })
})
