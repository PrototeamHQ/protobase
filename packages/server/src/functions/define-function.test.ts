import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { defineFunction, toApiFunction } from './define-function'

const handler = () => new Response('hi')

describe('toApiFunction', () => {
  it('takes defineFunction(...), a bare handler or a Hono app, the last two protected', () => {
    const defined = defineFunction({ public: true }, handler)
    expect(toApiFunction('hook', defined)).toBe(defined)
    expect(toApiFunction('hello', handler)).toEqual({ kind: 'function', options: {}, handler })
    const app = new Hono()
    expect(toApiFunction('shop', app)).toEqual({ kind: 'function', options: {}, handler: app })
    expect(defineFunction({ roles: ['admin'] }, app)).toEqual({ kind: 'function', options: { roles: ['admin'] }, handler: app })
  })

  it('refuses anything else, and a name that is no URL segment', () => {
    expect(() => toApiFunction('hello', { default: handler })).toThrow('The function "hello" must default-export defineFunction(...), a (request, context) handler or a Hono app')
    expect(() => toApiFunction('hello', undefined)).toThrow('must default-export')
    expect(() => toApiFunction('hello', { kind: 'function', options: {}, handler: 'nope' })).toThrow('The function "hello" has no handler')
    for (const name of ['', '-x', 'a.b', 'a/b', 'ünï']) expect(() => toApiFunction(name, handler)).toThrow('is not a URL segment')
    expect(toApiFunction('send_invoice-2', handler)).toMatchObject({ handler })
  })
})
