import { describe, expect, it } from 'vitest'
import type { ProtobaseConfig } from '@protobase/config'
import { withDefaults } from './config-defaults'
import { mergeConfig } from './merge-config'
import type { ProjectFiles } from './project-files'

const files: ProjectFiles = { functions: {}, module: () => undefined, package: () => Promise.reject(new Error('none')) }
const merged = (config: ProtobaseConfig) => mergeConfig({ config, files, label: 'protobase.config.ts' })

describe('withDefaults', () => {
  it("takes the app's address and secret from the environment, and in dev the dev server's address", () => {
    expect(withDefaults(merged({}), 'serve', { PROTOBASE_URL: 'https://shop.example.com', PROTOBASE_SECRET: 's' })).toMatchObject({ url: 'https://shop.example.com', secret: 's' })
    expect(withDefaults(merged({}), 'dev', { PROTOBASE_DEV_URL: 'http://localhost:5173' }).url).toBe('http://localhost:5173')
    expect(withDefaults(merged({}), 'serve', { PROTOBASE_DEV_URL: 'http://localhost:5173' })).not.toHaveProperty('url')
    expect(withDefaults(merged({ url: 'https://own.example.com' }), 'serve', { PROTOBASE_URL: 'https://shop.example.com' }).url).toBe('https://own.example.com')
  })

  it("takes the app's previous secrets from the environment, comma separated, unless the config lists its own", () => {
    expect(withDefaults(merged({}), 'serve', { PROTOBASE_PREVIOUS_SECRETS: 'b, a' }).previousSecrets).toEqual(['b', 'a'])
    expect(withDefaults(merged({ previousSecrets: ['c'] }), 'serve', { PROTOBASE_PREVIOUS_SECRETS: 'b' }).previousSecrets).toEqual(['c'])
    expect(withDefaults(merged({}), 'serve', { PROTOBASE_PREVIOUS_SECRETS: ' ' })).not.toHaveProperty('previousSecrets')
  })

  it('turns sign-in on with its defaults, unless the config turns it off or trusts an auth server elsewhere', () => {
    expect(withDefaults(merged({}), 'serve', { PROTOBASE_TRUSTED_ORIGINS: 'https://a.example, https://b.example' }).auth).toEqual({ trustedOrigins: ['https://a.example', 'https://b.example'] })
    expect(withDefaults(merged({ auth: { roles: ['admin', 'sales'] } }), 'serve', {}).auth).toEqual({ roles: ['admin', 'sales'] })
    expect(withDefaults(merged({ auth: false }), 'serve', {})).not.toHaveProperty('auth')
    expect(withDefaults(merged({ authenticate: { jwksUrl: 'https://auth.example.com/jwks', issuer: 'https://auth.example.com' } }), 'serve', {})).not.toHaveProperty('auth')
  })
})
