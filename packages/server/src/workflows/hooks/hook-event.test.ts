import { describe, expect, it } from 'vitest'
import { hookEvent, keptHeaders, overInputLimit, receivedRequest } from './hook-event'

const call = (headers: Record<string, string>, body = '{"a":1}') => new Request('https://app.test/api/workflows/hooks/the-key?x=1', { method: 'POST', headers, body })

describe('hookEvent', () => {
  it('leaves out every credential and proxy header, whatever their case', () => {
    const headers = new Headers({ Authorization: 'Bearer s', COOKIE: 'session=1', 'Webhook-Signature': 'v1,x', 'Webhook-Id': 'msg', 'X-Hub-Signature-256': 'sha256=x', 'X-Forwarded-For': '1.2.3.4', 'Proxy-Authorization': 'x', 'content-type': 'application/json', 'x-event': 'push' })
    expect(keptHeaders(headers, 'X-HUB-SIGNATURE-256')).toEqual({ 'content-type': 'application/json', 'x-event': 'push' })
  })

  it('parses JSON and form bodies, keeps other text, and leaves the address out', () => {
    expect(hookEvent(call({ 'content-type': 'application/json' }), new TextEncoder().encode('{"a":1}'), undefined)).toMatchObject({ method: 'POST', query: { x: '1' }, body: { a: 1 } })
    expect(hookEvent(call({ 'content-type': 'application/x-www-form-urlencoded' }), new TextEncoder().encode('a=1&b=2'), undefined).body).toEqual({ a: '1', b: '2' })
    expect(hookEvent(call({ 'content-type': 'application/x-www-form-urlencoded' }), new TextEncoder().encode('tag=a&one=1&tag=b'), undefined).body).toEqual({ tag: ['a', 'b'], one: '1' })
    expect(hookEvent(call({ 'content-type': 'application/json' }), new TextEncoder().encode('{not json'), undefined).body).toBe('{not json')
    expect(JSON.stringify(hookEvent(call({}), new Uint8Array(), undefined))).not.toContain('the-key')
  })

  it('gives a plugin the same call without the key in its address', () => {
    const request = receivedRequest(call({ authorization: 'Bearer s' }), new Uint8Array(), undefined)
    expect(request.url).toBe('https://app.test/?x=1')
    expect(request.headers.get('authorization')).toBeNull()
  })
})

describe('overInputLimit', () => {
  it('measures the call as its run input, escaped as JSON, rather than its body', () => {
    // 600 000 quotes are under 1 MiB as a body, and twice that once JSON escapes each one.
    const quotes = new TextEncoder().encode('"'.repeat(600_000))
    expect(overInputLimit(hookEvent(call({ 'content-type': 'text/plain' }), quotes, undefined))).toBe(true)
    expect(overInputLimit(hookEvent(call({ 'content-type': 'text/plain' }), new TextEncoder().encode('a'.repeat(600_000)), undefined))).toBe(false)
  })
})
