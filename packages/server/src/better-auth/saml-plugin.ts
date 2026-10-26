import { sso, type SSOOptions } from '@better-auth/sso'
import type { BetterAuthPlugin } from 'better-auth'
import { samlEntityId, type ResolvedSamlProvider } from './saml-sign-in'

// Better Auth's SSO plugin, apart from the rest of SAML sign-in so that `buildAuth` loads it only for an app with SAML
// providers.

type DefaultSso = NonNullable<SSOOptions['defaultSSO']>[number]

/** The provider as one of the SSO plugin's configured providers (`defaultSSO`). */
export const defaultSsoEntry = (provider: ResolvedSamlProvider, baseURL: string): DefaultSso => {
  const { idp, attributes = {} } = provider
  const mapping = Object.fromEntries(Object.entries(attributes).filter(([, name]) => name !== undefined))
  return {
    providerId: provider.id,
    domain: provider.domains.join(','),
    samlConfig: {
      issuer: samlEntityId(baseURL, provider.id),
      // With metadata, the plugin reads the sign-in URL and the certificate from the XML and ignores this.
      entryPoint: 'ssoUrl' in idp ? idp.ssoUrl : '',
      idpMetadata: 'metadata' in idp ? { metadata: idp.metadata } : { entityID: idp.entityId, cert: idp.certificate },
      ...(Object.keys(mapping).length > 0 && { mapping }),
    },
  }
}

/**
 * Better Auth's SSO plugin with the configured providers. Their domains are trusted, so an address there links to the
 * account that has it; organizations are not assigned by provider, and nobody registers providers.
 */
export const samlPlugin = (providers: ResolvedSamlProvider[], baseURL: string) => {
  // Protobase keeps the providers in config, so the plugin's provider table is never created or read.
  const { schema: _schema, ...plugin } = sso({
    defaultSSO: providers.map((provider) => defaultSsoEntry(provider, baseURL)),
    domainVerification: { enabled: true },
    organizationProvisioning: { disabled: true },
    providersLimit: 0,
  })
  return plugin satisfies BetterAuthPlugin
}
