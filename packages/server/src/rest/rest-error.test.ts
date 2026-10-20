import { describe, expect, it } from 'vitest'
import { restError, restErrorOf } from './rest-error'

const databaseError = (code: string, message: string, extra: Record<string, string> = {}) => Object.assign(new Error(message), { code, ...extra })

describe('restErrorOf', () => {
  it('passes a database error on with PostgREST\'s status for its code', () => {
    expect(restErrorOf(databaseError('23505', 'duplicate key value', { detail: 'Key (username)=(alice) already exists.' }), false)).toMatchObject({
      status: 409,
      body: { code: '23505', message: 'duplicate key value', details: 'Key (username)=(alice) already exists.', hint: null },
    })
    const statuses = Object.entries({ '22P02': 400, '25006': 405, '42883': 404, '42P01': 404, P0001: 400, P0002: 500, '57014': 500, '53300': 503, '40001': 500, PT402: 402 })
    for (const [code, status] of statuses) expect(restErrorOf(databaseError(code, 'x'), false)?.status).toBe(status)
  })

  it('is 401 for an RLS refusal of an anonymous caller and 403 for others', () => {
    expect(restErrorOf(databaseError('42501', 'new row violates row-level security policy'), true)?.status).toBe(401)
    expect(restErrorOf(databaseError('42501', 'new row violates row-level security policy'), false)?.status).toBe(403)
  })

  it('keeps its own errors and knows no others', () => {
    const own = restError(406, 'PGRST116', 'Cannot coerce the result to a single JSON object')
    expect(restErrorOf(own, false)).toBe(own)
    expect(restErrorOf(new Error('boom'), false)).toBeUndefined()
  })
})
