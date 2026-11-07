import { describe, expect, it } from 'vitest'
import type { FcmRecording } from '../../packages/server/src/notifications/fcm/testing/recordings'
import { findFcmLeak, scrubRecording } from './scrub'

const real = { projectId: 'real-project-123', clientEmail: 'sender@real-project-123.iam.gserviceaccount.com' }

const recording = (change: Partial<FcmRecording['request']>, body: unknown): FcmRecording => ({
  stand_in: false,
  recorded_at: '2026-11-07T00:00:00.000Z',
  request: { method: 'POST', url: `https://fcm.googleapis.com/v1/projects/${real.projectId}/messages:send`, headers: {}, body: {}, ...change },
  response: { status: 200, headers: {}, body },
})

describe('scrubRecording', () => {
  it('replaces the assertion, the tokens, the project and the address with placeholders', () => {
    const exchange = scrubRecording(recording({ body: { grant_type: 'jwt', assertion: 'eyJreal.claims.signature' } }, { access_token: 'ya29.real', token_type: 'Bearer' }), real)
    expect(exchange.request.body.assertion).toBe('snapshot-assertion-1')
    expect(exchange.response.body).toEqual({ access_token: 'snapshot-access_token-1', token_type: 'Bearer' })

    const send = scrubRecording(recording({ headers: { authorization: 'Bearer ya29.real' } }, { error: { message: `Denied for ${real.clientEmail} on project ${real.projectId}` } }), real)
    expect(send.request.url).toBe('https://fcm.googleapis.com/v1/projects/example-project/messages:send')
    expect(send.request.headers.authorization).toBe('Bearer snapshot-access_token-1')
    expect(send.response.body).toEqual({ error: { message: 'Denied for fcm-sender@example.com on project example-project' } })
    expect(scrubRecording(recording({ headers: { authorization: 'Bearer invalid-recording-bearer' } }, {}), real).request.headers.authorization).toBe('Bearer snapshot-access_token-2')
  })

  it('finds a key, a secret value, the real project or a token shape, naming its kind alone', () => {
    expect(findFcmLeak({ key: '-----BEGIN PRIVATE KEY-----\nabc' }, [])).toBe('a private key')
    expect(findFcmLeak({ url: `projects/${real.projectId}` }, [real.projectId])).toBe('a secret value')
    expect(findFcmLeak({ token: 'ya29.abc' }, [])).toBe('a Google token or client shape')
    expect(findFcmLeak({ ok: 'snapshot-access_token-1', email: 'fcm-sender@example.com' }, [real.projectId, real.clientEmail])).toBeUndefined()
  })
})
