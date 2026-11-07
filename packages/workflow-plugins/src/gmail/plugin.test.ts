import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { pollingRun } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailPlugin } from './plugin'

describe('gmailPlugin', () => {
  it("sends the token to Gmail's own API unless the app's code says otherwise", async () => {
    const gmail = fakeGmail()
    await pollingRun(gmailPlugin().triggers.new_mail, gmail).start().catch(() => undefined)
    expect(gmail.calls.map(({ origin }) => origin)).toEqual(['https://gmail.googleapis.com'])
  })

  it('takes https, or http on this machine alone', () => {
    for (const apiUrl of ['http://gmail.example.com', 'http://10.0.0.1', 'ftp://localhost', 'gmail.example.com']) expect(() => gmailPlugin({ apiUrl })).toThrow("The Gmail plugin's apiUrl must be an https URL")
    expect(() => gmailPlugin({ apiUrl: 'https://gmail.example.com/any/path' })).not.toThrow()
    expect(() => gmailPlugin({ apiUrl: 'http://127.0.0.1:4010' })).not.toThrow()
  })

  it('asks for read-only access alone and lets no other input in', () => {
    const plugin = gmailPlugin()
    expect(plugin.connections.google).toMatchObject({ signIn: 'google', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })
    expect(plugin.triggers.new_mail).toMatchObject({ kind: 'polling', every: '1 minute', limit: 90, connection: 'google', input: { additionalProperties: false } })
  })
})
