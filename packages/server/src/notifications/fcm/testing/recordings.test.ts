import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkedRecording, loadRecording, recordingNames, recordingsDir, type FcmRecording } from './recordings'

describe('the committed FCM recordings', () => {
  it('keep placeholders only: no assertion, access token, bearer or key', () => {
    const names = recordingNames()
    expect(names.sort()).toEqual(['send-invalid-argument', 'send-ok', 'send-permission-denied', 'send-unauthenticated', 'send-unregistered', 'token-invalid-grant', 'token-ok'])
    for (const name of names) {
      const recording = loadRecording(name)
      const text = readFileSync(join(recordingsDir, `${name}.json`), 'utf8')
      expect(text).not.toMatch(/PRIVATE KEY|ya29\.|eyJ[A-Za-z0-9_-]{10,}/)
      if (recording.request.headers.authorization !== undefined) expect(recording.request.headers.authorization).toMatch(/^Bearer snapshot-access_token-\d+$/)
      if (recording.request.body.assertion !== undefined) expect(recording.request.body.assertion).toMatch(/^snapshot-assertion-\d+$/)
    }
    expect(names.filter((name) => loadRecording(name).stand_in)).toEqual(['send-ok'])
  })

  it('refuses a recording that keeps a credential', () => {
    const recording = loadRecording('token-ok')
    const withToken: FcmRecording = { ...recording, response: { ...recording.response, body: { access_token: 'real-token' } } }
    expect(() => checkedRecording(withToken, 'token-ok')).toThrow('a credential is not a placeholder')
    const withAssertion: FcmRecording = { ...recording, request: { ...recording.request, body: { assertion: 'eyJhbGciOiJSUzI1NiJ9.e30.sig' } } }
    expect(() => checkedRecording(withAssertion, 'token-ok')).toThrow('a credential is not a placeholder')
  })
})
