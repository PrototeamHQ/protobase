import { describe, expect, it } from 'vitest'
import { apiKeySettings } from './api-key-settings'

const publishable = 'sb_publishable_abc'
const secret = 'sb_secret_xyz'

describe('apiKeySettings', () => {
  it('reads the keys from the options before the environment, trimmed', () => {
    expect(apiKeySettings(undefined, { PROTOBASE_PUBLISHABLE_KEY: ` ${publishable} `, PROTOBASE_SECRET_KEY: secret })).toEqual({ publishable, secret })
    expect(apiKeySettings({ secret_key: 'sb_secret_own' }, { PROTOBASE_SECRET_KEY: secret })).toEqual({ secret: 'sb_secret_own' })
  })

  it('has no keys when none is set, one is blank or the option is false', () => {
    expect(apiKeySettings(undefined, {})).toEqual({})
    expect(apiKeySettings(undefined, { PROTOBASE_PUBLISHABLE_KEY: '  ' })).toEqual({})
    expect(apiKeySettings(false, { PROTOBASE_PUBLISHABLE_KEY: publishable })).toEqual({})
  })

  it('stops on swapped or equal keys without printing them', () => {
    expect(() => apiKeySettings(undefined, { PROTOBASE_PUBLISHABLE_KEY: secret })).toThrow('PROTOBASE_PUBLISHABLE_KEY starts with sb_secret_, the other key\'s prefix; swap the two keys')
    expect(() => apiKeySettings({ secret_key: publishable }, {})).toThrow('The secret_key option starts with sb_publishable_')
    expect(() => apiKeySettings({ publishable_key: 'same', secret_key: 'same' }, {})).toThrow(/^The publishable and the secret key are the same/)
  })
})
