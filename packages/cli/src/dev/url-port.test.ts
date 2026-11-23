import { describe, expect, it } from 'vitest'
import { urlPortWarning } from './url-port'

describe('urlPortWarning', () => {
  it('warns of a PROTOBASE_URL on this machine at another port', () => {
    expect(urlPortWarning({ PROTOBASE_URL: 'http://localhost:5173' }, 23456)).toBe(
      'PROTOBASE_URL is http://localhost:5173, but protobase dev serves http://localhost:23456, where sign-in refuses its pages: remove PROTOBASE_URL from .env, so dev uses its own address, or run protobase dev --port 5173 once to keep that port',
    )
    expect(urlPortWarning({ PROTOBASE_URL: 'http://[::1]' }, 23456)).toContain('--port 80 ')
  })

  it.each([undefined, '', 'http://localhost:23456', 'http://127.0.0.1:23456/', 'https://my-tunnel.example.com', 'not a url'])('stays quiet for %j', (value) => {
    expect(urlPortWarning({ PROTOBASE_URL: value }, 23456)).toBeUndefined()
  })
})
