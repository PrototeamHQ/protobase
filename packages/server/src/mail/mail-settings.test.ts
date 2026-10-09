import { describe, expect, it } from 'vitest'
import { readMailSettings } from './mail-settings'

const smtpUrl = 'smtps://tenant:s3cret@relay.example.net:465'

describe('readMailSettings', () => {
  it('reads the SMTP URL and the sender', () => {
    expect(readMailSettings({ PROTOBASE_SMTP_URL: smtpUrl, PROTOBASE_MAIL_FROM: 'noreply@acme.example.com' })).toEqual({ smtpUrl, from: 'noreply@acme.example.com' })
    expect(readMailSettings({ PROTOBASE_SMTP_URL: 'smtp://relay:587', PROTOBASE_MAIL_FROM: ' noreply@acme.example.com ' })).toEqual({ smtpUrl: 'smtp://relay:587', from: 'noreply@acme.example.com' })
  })

  it('is off when neither is set, empty values included', () => {
    expect(readMailSettings({})).toBeUndefined()
    expect(readMailSettings({ PROTOBASE_SMTP_URL: '', PROTOBASE_MAIL_FROM: '' })).toBeUndefined()
  })

  it('refuses one without the other', () => {
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: smtpUrl })).toThrow('PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM go together')
    expect(() => readMailSettings({ PROTOBASE_MAIL_FROM: 'noreply@acme.example.com' })).toThrow('go together')
  })

  it('refuses a URL that is not SMTP, or has no host', () => {
    const from = 'noreply@acme.example.com'
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: 'relay.example.net:465', PROTOBASE_MAIL_FROM: from })).toThrow('must start with smtp:// or smtps://')
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: 'not a url', PROTOBASE_MAIL_FROM: from })).toThrow('PROTOBASE_SMTP_URL is not a URL')
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: 'https://relay.example.net', PROTOBASE_MAIL_FROM: from })).toThrow('not https://')
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: 'smtp://', PROTOBASE_MAIL_FROM: from })).toThrow('has no host')
  })

  it('wants a plain sender address', () => {
    for (const from of ['noreply', 'Acme <noreply@acme.example.com>', 'no reply@acme.example.com', 'noreply@localhost']) {
      expect(() => readMailSettings({ PROTOBASE_SMTP_URL: smtpUrl, PROTOBASE_MAIL_FROM: from })).toThrow('PROTOBASE_MAIL_FROM must be a plain email address')
    }
  })

  it('never puts the credential in an error', () => {
    expect(() => readMailSettings({ PROTOBASE_SMTP_URL: 'http://tenant:s3cret@relay', PROTOBASE_MAIL_FROM: 'noreply@acme.example.com' })).toThrow(expect.objectContaining({ message: expect.not.stringContaining('s3cret') }))
  })
})
