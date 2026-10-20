import { describe, expect, it } from 'vitest'
import { accountIdSql, accountProviderSql, providerFate } from './identity-providers'

describe('providerFate', () => {
  it("names each provider as Better Auth does, and says which it has built in", () => {
    expect(providerFate('github')).toEqual({ kind: 'account', providerId: 'github', builtIn: true })
    expect(providerFate('azure')).toEqual({ kind: 'account', providerId: 'microsoft', builtIn: true })
    expect(providerFate('linkedin_oidc')).toEqual({ kind: 'account', providerId: 'linkedin', builtIn: true })
    expect(providerFate('slack_oidc')).toEqual({ kind: 'account', providerId: 'slack', builtIn: true })
    expect(providerFate('x')).toEqual({ kind: 'account', providerId: 'twitter', builtIn: true })
    expect(providerFate('keycloak')).toEqual({ kind: 'account', providerId: 'keycloak', builtIn: false })
  })

  it('carries no account over for email, phone, anonymous and single sign-on identities', () => {
    for (const provider of ['email', 'phone', 'anonymous', 'sso:0b6f3a5e-7c1d-4f7a-9d2e-1a2b3c4d5e6f']) expect(providerFate(provider).kind).toBe('none')
  })
})

it("keys a Microsoft account on its oid claim, every other on GoTrue's provider_id", () => {
  expect(accountProviderSql).toBe("case provider when 'azure' then 'microsoft' when 'linkedin_oidc' then 'linkedin' when 'slack_oidc' then 'slack' when 'x' then 'twitter' else provider end")
  expect(accountIdSql).toBe("case provider when 'azure' then identity_data->'custom_claims'->>'oid' else provider_id end")
})
