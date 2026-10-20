import { describe, expect, it } from 'vitest'
import { callerSettings } from './caller-settings'

describe('callerSettings', () => {
  it('sets the anon role and its claims', () => {
    expect(callerSettings({ role: 'anon', claims: { role: 'anon' } })).toEqual({ role: 'anon', 'request.jwt.claims': '{"role":"anon"}' })
  })

  it('sets the authenticated role, the user and the claims with the database role as their role, and the actor', () => {
    expect(callerSettings({ role: 'authenticated', claims: { sub: 'u1', role: 'admin', email: 'a@example.com' } }, 'changes.actor')).toEqual({
      role: 'authenticated',
      'request.jwt.claims': '{"sub":"u1","role":"authenticated","email":"a@example.com"}',
      'request.jwt.claim.sub': 'u1',
      'changes.actor': '{"id":"u1","roles":[]}',
    })
  })

  it('sets no role for the app\'s own, and service_role as its claim', () => {
    expect(callerSettings({ role: 'app', claims: { role: 'service_role' } }, 'changes.actor')).toEqual({ 'request.jwt.claims': '{"role":"service_role"}' })
  })
})
