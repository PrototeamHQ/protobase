import { describe, expect, it } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { withAnonymous } from './anonymous'
import { MissingCredentials, unauthorized } from './problem'
import type { Authenticator } from './types'

const signedIn: Authenticator = (request) => {
  if (!request.headers.has('authorization')) throw new MissingCredentials('Send a token')
  if (request.headers.get('authorization') !== 'Bearer good') throw unauthorized('The token is invalid')
  return { user: { id: 'u1', roles: ['admin'] } }
}
const withRole = withAnonymous(signedIn, defineRoles({ anonymous: [{ 'products.read': ['name'] }] }))
const request = (authorization?: string) => new Request('http://x/', { headers: authorization ? { authorization } : {} })

describe('withAnonymous', () => {
  it('serves a request without a credential as the anonymous role, with no tenant', async () => {
    expect(await withRole(request())).toEqual({ user: { id: '', roles: ['anonymous'] }, anonymous: true })
    expect(await withRole(request('Bearer good'))).toEqual({ user: { id: 'u1', roles: ['admin'] } })
  })

  it('keeps the 401 of an invalid credential, and of a missing one without the role', async () => {
    await expect(withRole(request('Bearer bad'))).rejects.toThrow('The token is invalid')
    expect(withAnonymous(signedIn, defineRoles({ admin: ['*'] }))).toBe(signedIn)
    expect(withAnonymous(signedIn, undefined)).toBe(signedIn)
  })
})
