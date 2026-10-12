import { describe, expect, it } from 'vitest'
import { errorReportingSettings } from './error-reporting-settings'

const dsn = 'https://public@errors.example.com/42'

describe('errorReportingSettings', () => {
  it('is the DSN set, the option over the environment', () => {
    expect(errorReportingSettings({ dsn, environment: 'staging' }, { PROTOBASE_SENTRY_DSN: 'https://other@errors.example.com/7' })).toEqual({ dsn, environment: 'staging' })
    expect(errorReportingSettings(undefined, { PROTOBASE_SENTRY_DSN: ` ${dsn} ` })).toEqual({ dsn })
    expect(errorReportingSettings({ environment: 'staging' }, { PROTOBASE_SENTRY_DSN: dsn })).toEqual({ dsn, environment: 'staging' })
  })

  it('is off without a DSN, or when the option is false', () => {
    expect(errorReportingSettings(undefined, {})).toBeUndefined()
    expect(errorReportingSettings(undefined, { PROTOBASE_SENTRY_DSN: ' ' })).toBeUndefined()
    expect(errorReportingSettings({ environment: 'staging' }, {})).toBeUndefined()
    expect(errorReportingSettings(false, { PROTOBASE_SENTRY_DSN: dsn })).toBeUndefined()
  })

  it('refuses a DSN that cannot be one, naming where it came from but not the DSN', () => {
    expect(() => errorReportingSettings(undefined, { PROTOBASE_SENTRY_DSN: 'errors.example.com/42' })).toThrow('PROTOBASE_SENTRY_DSN is not a URL')
    expect(() => errorReportingSettings({ dsn: 'ftp://public@errors.example.com/42' }, {})).toThrow('options.errorReporting.dsn must start with https:// or http://')
    expect(() => errorReportingSettings(undefined, { PROTOBASE_SENTRY_DSN: 'https://errors.example.com/42' })).toThrow('PROTOBASE_SENTRY_DSN has no public key')
    expect(() => errorReportingSettings(undefined, { PROTOBASE_SENTRY_DSN: 'https://secretkey@errors.example.com/' })).toThrow(expect.objectContaining({ message: expect.not.stringContaining('secretkey') }))
  })
})
