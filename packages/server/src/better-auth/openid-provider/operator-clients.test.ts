import { describe, expect, it } from 'vitest'
import { tokenRequestClientId } from './operator-clients'

const basic = (clientId: string) => `Basic ${btoa(`${encodeURIComponent(clientId)}:secret`)}`

describe('tokenRequestClientId', () => {
  it('takes the client the body or the Basic credentials name', () => {
    expect(tokenRequestClientId({ client_id: 'phone' }, null)).toBe('phone')
    expect(tokenRequestClientId({}, basic('shop'))).toBe('shop')
    expect(tokenRequestClientId({ client_id: 'shop' }, basic('shop'))).toBe('shop')
  })

  it('names no client when the body and the Basic credentials name different ones', () => {
    expect(tokenRequestClientId({ client_id: 'phone' }, basic('shop'))).toBeUndefined()
  })

  it('names no client without either', () => {
    expect(tokenRequestClientId({}, null)).toBeUndefined()
    expect(tokenRequestClientId({}, 'Basic !!!')).toBeUndefined()
  })
})
