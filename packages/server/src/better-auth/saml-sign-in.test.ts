import { describe, expect, it } from 'vitest'
import { emailInDomains, resolveSamlProviders, samlEntityId, samlRefusal, type SamlProvider } from './saml-sign-in'
import { defaultSsoEntry } from './saml-plugin'

const metadata = '<EntityDescriptor entityID="https://idp.example.com"/>'
const okta: SamlProvider = { id: 'okta', domains: ['Example.com '], idp: { metadata } }
const manual = { entityId: 'https://idp.example.com', ssoUrl: 'https://idp.example.com/sso', certificate: 'MIIC...' }

describe('resolveSamlProviders', () => {
  it('names a provider SSO by default and trims and lowercases its domains', () => {
    expect(resolveSamlProviders([okta], [])).toEqual([{ ...okta, name: 'SSO', domains: ['example.com'] }])
    expect(resolveSamlProviders([{ ...okta, name: 'Okta' }], [])[0]!.name).toBe('Okta')
  })

  it('takes the entity ID, sign-in URL and certificate instead of metadata', () => {
    expect(resolveSamlProviders([{ ...okta, idp: manual }], [])[0]!.idp).toEqual(manual)
  })

  it('refuses a malformed id, one used twice, and the id of another sign-in provider', () => {
    expect(() => resolveSamlProviders([{ ...okta, id: 'Okta SSO' }], [])).toThrow(/Invalid SAML provider id "Okta SSO"/)
    expect(() => resolveSamlProviders([okta, okta], [])).toThrow(/"okta" is used twice/)
    expect(() => resolveSamlProviders([okta], ['github', 'okta'])).toThrow(/"okta" is already the id of another sign-in provider/)
  })

  it('refuses no domains, and a domain that is not a host name', () => {
    expect(() => resolveSamlProviders([{ ...okta, domains: [] }], [])).toThrow(/domains/)
    for (const domain of ['@example.com', 'https://example.com', 'example .com', 'people@example.com']) {
      expect(() => resolveSamlProviders([{ ...okta, domains: [domain] }], [])).toThrow(/domains must be host names/)
    }
  })

  it('refuses IdP settings without metadata or one of entityId, ssoUrl and certificate, and an ssoUrl that is not a URL', () => {
    for (const idp of [{ metadata: ' ' }, { ...manual, entityId: '' }, { ...manual, ssoUrl: '' }, { ...manual, certificate: [] }]) {
      expect(() => resolveSamlProviders([{ ...okta, idp }], [])).toThrow(/give idp.metadata, or all of idp.entityId, idp.ssoUrl and idp.certificate/)
    }
    expect(() => resolveSamlProviders([{ ...okta, idp: { ...manual, ssoUrl: 'idp.example.com/sso' } }], [])).toThrow(/idp.ssoUrl must be a URL/)
  })
})

describe('defaultSsoEntry', () => {
  const [resolved] = resolveSamlProviders([{ ...okta, domains: ['example.com', 'example.org'] }], [])

  it('is the provider with its entity ID on baseURL and its domains joined', () => {
    expect(samlEntityId('https://admin.example.com/', 'okta')).toBe('https://admin.example.com/api/auth/sso/saml2/sp/metadata?providerId=okta')
    expect(defaultSsoEntry(resolved!, 'https://admin.example.com')).toEqual({
      providerId: 'okta',
      domain: 'example.com,example.org',
      samlConfig: { issuer: 'https://admin.example.com/api/auth/sso/saml2/sp/metadata?providerId=okta', entryPoint: '', idpMetadata: { metadata } },
    })
  })

  it('takes the manual IdP settings and only the attribute names given', () => {
    const entry = defaultSsoEntry({ ...resolved!, idp: { ...manual, certificate: ['one', 'two'] }, attributes: { email: 'mail', lastName: 'sn' } }, 'https://admin.example.com')
    expect(entry.samlConfig).toMatchObject({ entryPoint: manual.ssoUrl, idpMetadata: { entityID: manual.entityId, cert: ['one', 'two'] }, mapping: { email: 'mail', lastName: 'sn' } })
    expect(Object.keys(entry.samlConfig!.mapping!)).toEqual(['email', 'lastName'])
  })
})

describe('samlRefusal', () => {
  const ids = ['okta']
  const byPath = (providerId: string) => [
    { path: '/sign-in/sso', body: { providerId, callbackURL: '/' } },
    { path: '/sso/saml2/sp/metadata', query: { providerId } },
    ...['/sso/saml2/sp/acs/:providerId', '/sso/saml2/sp/slo/:providerId', '/sso/saml2/logout/:providerId'].map((path) => ({ path, params: { providerId } })),
  ]

  it('lets a configured provider through on each of its paths', () => {
    for (const request of byPath('okta')) expect(samlRefusal(request, ids)).toBeUndefined()
  })

  it('refuses a provider that is not configured on each path', () => {
    for (const request of byPath('acme')) expect(samlRefusal(request, ids)).toBe('No SAML provider acme')
  })

  it('refuses a sign-in by address, domain or organization instead of a provider', () => {
    for (const body of [{ email: 'sanne@example.com' }, { domain: 'example.com' }, { organizationSlug: 'acme' }, undefined]) {
      expect(samlRefusal({ path: '/sign-in/sso', body }, ids)).toBe('Name the SAML provider by its providerId')
    }
  })

  it('always refuses the OIDC callback, and leaves other paths alone', () => {
    expect(samlRefusal({ path: '/sso/callback/:providerId', params: { providerId: 'okta' } }, ids)).toBe('No OpenID Connect provider is configured')
    expect(samlRefusal({ path: '/sign-in/social', body: { provider: 'acme' } }, ids)).toBeUndefined()
    expect(samlRefusal({ path: '/callback/:id', params: { id: 'acme' } }, ids)).toBeUndefined()
  })
})

describe('emailInDomains', () => {
  it('takes an address at a domain or a subdomain of one, whatever its case', () => {
    expect(emailInDomains('sanne@example.com', ['example.com'])).toBe(true)
    expect(emailInDomains('sanne@eu.example.com', ['example.com'])).toBe(true)
    expect(emailInDomains('Sanne@EXAMPLE.com', ['example.com'])).toBe(true)
    expect(emailInDomains('sanne@example.org', ['example.com', 'example.org'])).toBe(true)
  })

  it('refuses a lookalike domain, another domain and no address', () => {
    expect(emailInDomains('sanne@notexample.com', ['example.com'])).toBe(false)
    expect(emailInDomains('sanne@example.com.evil.test', ['example.com'])).toBe(false)
    expect(emailInDomains('example.com', ['example.com'])).toBe(false)
  })
})
