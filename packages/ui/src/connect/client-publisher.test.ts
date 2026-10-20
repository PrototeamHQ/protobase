import { describe, expect, it } from 'vitest'
import { clientPublisher } from './client-publisher'

describe('who published a client', () => {
  it('is the host of an https client id', () => {
    expect(clientPublisher('https://claude.ai/oauth/mcp-oauth-client-metadata')).toBe('claude.ai')
  })

  it('is nobody for an id the server chose, or an http one', () => {
    expect(clientPublisher('qHOTkMUfJCgEtTJsgSLXIyAsDNzDZgrf')).toBeUndefined()
    expect(clientPublisher('http://claude.ai/client.json')).toBeUndefined()
  })
})
