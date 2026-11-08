import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { workspaceOrigin } from './origin'
import { relayRegistration } from './registration'

const apnsToken = 'ab'.repeat(32)
const fcmToken = 'cToken0:APA91b-fcm_token'

const problemOf = (body: unknown) => {
  try {
    relayRegistration(body)
  } catch (error) {
    if (error instanceof HttpProblem) return { status: error.status, detail: error.detail }
    throw error
  }
}

describe('workspaceOrigin', () => {
  it('takes an https origin as the URL parser writes it, and nothing more or less', () => {
    expect(workspaceOrigin('https://a.example.com')).toBe('https://a.example.com')
    expect(workspaceOrigin('https://a.example.com:8443')).toBe('https://a.example.com:8443')
    for (const bad of ['http://a.example.com', 'https://a.example.com/', 'https://a.example.com/x', 'https://A.example.com', 'https://a.example.com:443', 'https://u@a.example.com', 'a.example.com', 1, undefined]) expect(workspaceOrigin(bad)).toBeUndefined()
  })
})

describe('relayRegistration', () => {
  it('takes an APNs token with its environment, or an FCM token, and the workspace origin', () => {
    expect(relayRegistration({ kind: 'apns', token: apnsToken, environment: 'sandbox', origin: 'https://a.example.com' })).toEqual({ kind: 'apns', token: apnsToken, environment: 'sandbox', origin: 'https://a.example.com' })
    expect(relayRegistration({ kind: 'fcm', token: fcmToken, origin: 'https://a.example.com' })).toEqual({ kind: 'fcm', token: fcmToken, environment: null, origin: 'https://a.example.com' })
  })

  it('refuses anything else with a 400 naming the field, never its value', () => {
    const cases: [unknown, string][] = [
      [{ kind: 'apns', token: apnsToken.toUpperCase(), environment: 'sandbox', origin: 'https://a.example.com' }, 'token'],
      [{ kind: 'apns', token: apnsToken, origin: 'https://a.example.com' }, 'environment'],
      [{ kind: 'fcm', token: 'has space', origin: 'https://a.example.com' }, 'token'],
      [{ kind: 'fcm', token: fcmToken, origin: 'http://evil.example.com' }, 'origin'],
      [{ kind: 'fcm', token: fcmToken, origin: 'https://a.example.com', handle: 'mine' }, ''],
      [{ kind: 'relay', token: fcmToken, origin: 'https://a.example.com' }, 'kind'],
      [null, ''],
    ]
    for (const [body, field] of cases) {
      const problem = problemOf(body)!
      expect(problem.status).toBe(400)
      expect(problem.detail).toContain('The registration is invalid')
      if (field) expect(problem.detail).toContain(field)
      expect(problem.detail).not.toContain('evil')
    }
  })
})
