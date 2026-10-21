import { describe, expect, it } from 'vitest'
import { clientPublisher } from './client-publisher'

describe('who published a client', () => {
  it('is the host of an https client id', () => {
    expect(clientPublisher('https://assistant.example/oauth/client-metadata')).toBe('assistant.example')
  })

  it('is nobody for an id the server chose, or an http one', () => {
    expect(clientPublisher('qHOTkMUfJCgEtTJsgSLXIyAsDNzDZgrf')).toBeUndefined()
    expect(clientPublisher('http://assistant.example/client.json')).toBeUndefined()
  })
})
