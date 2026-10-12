import { describe, expect, it } from 'vitest'
import { redactSecrets } from './redact-secrets'

describe('redactSecrets', () => {
  it('filters credential headers and cookies, and keeps the rest', () => {
    const request = {
      method: 'POST',
      headers: { authorization: 'Bearer abc', cookie: 'session=1', 'x-api-key': 'k', 'content-type': 'application/json' },
      cookies: { anything: 'x' },
    }
    expect(redactSecrets({ request })).toEqual({
      request: { method: 'POST', headers: { authorization: '[Filtered]', cookie: '[Filtered]', 'x-api-key': '[Filtered]', 'content-type': 'application/json' }, cookies: '[Filtered]' },
    })
  })

  it('filters passwords and tokens at any depth, in objects and in lists of pairs', () => {
    expect(redactSecrets({ extra: { body: { email: 'a@example.com', password: 'p', refresh_token: 't' } } })).toEqual({ extra: { body: { email: 'a@example.com', password: '[Filtered]', refresh_token: '[Filtered]' } } })
    expect(redactSecrets({ headers: [['Authorization', 'Basic x'], ['Accept', '*/*']] })).toEqual({ headers: [['Authorization', '[Filtered]'], ['Accept', '*/*']] })
  })

  it('filters secret query parameters of URLs and query strings', () => {
    expect(redactSecrets({ url: 'https://app.example.com/files/a.png?r=bikes&sig=abc&token=t#top', query_string: 'page=2&api_key=k' })).toEqual({
      url: 'https://app.example.com/files/a.png?r=bikes&sig=[Filtered]&token=[Filtered]#top',
      query_string: 'page=2&api_key=[Filtered]',
    })
    expect(redactSecrets({ breadcrumbs: [{ category: 'fetch', data: { url: '/api/v1/bikes?filter=x' } }] })).toEqual({ breadcrumbs: [{ category: 'fetch', data: { url: '/api/v1/bikes?filter=x' } }] })
  })

  it('leaves a value without secrets as it is', () => {
    const event = { message: 'boom', exception: { values: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: 'a.ts', lineno: 3 }] } }] }, tags: ['a', 'b'] }
    expect(redactSecrets(event)).toEqual(event)
    expect(redactSecrets('text')).toBe('text')
  })
})
