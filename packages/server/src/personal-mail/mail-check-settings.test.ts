import { describe, expect, it } from 'vitest'
import { readMailCheckSettings } from './mail-check-settings'

describe('the mail check settings', () => {
  it('name the service and the secret the platform passes, and nothing without the service', () => {
    expect(readMailCheckSettings({ PROTOBASE_SECRET: 'platform' })).toBeUndefined()
    expect(readMailCheckSettings({ PROTOBASE_MAIL_CHECK_URL: ' https://checks.example/apps/7/mail-checks/ ', PROTOBASE_SECRET: 'platform' })).toEqual({ url: 'https://checks.example/apps/7/mail-checks', platformSecret: 'platform' })
  })

  it('stop startup on a service without the secret, or on one that is no URL, naming the variable', () => {
    expect(() => readMailCheckSettings({ PROTOBASE_MAIL_CHECK_URL: 'https://checks.example' })).toThrow(/PROTOBASE_MAIL_CHECK_URL .* set PROTOBASE_SECRET/)
    expect(() => readMailCheckSettings({ PROTOBASE_MAIL_CHECK_URL: 'checks.example', PROTOBASE_SECRET: 'platform' })).toThrow(/PROTOBASE_MAIL_CHECK_URL is not a URL/)
  })
})
