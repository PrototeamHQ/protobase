import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { authBasePath } from './auth-base-path'
import { providerIdPattern } from './platform-sign-in'

/**
 * A SAML 2.0 identity provider people of the app sign in with, for example the company's Okta, Entra ID or Google
 * Workspace. Give its admin this app's entity ID and metadata, `{baseURL}/api/auth/sso/saml2/sp/metadata?providerId={id}`,
 * and the ACS URL `{origin}/api/auth/sso/saml2/sp/acs/{id}` of each origin the app serves.
 */
export type SamlProvider = {
  /** The id: the button's `?sign-in=` link, the provider's paths and the namespace of its accounts. Lowercase letters, digits or "-". */
  id: string
  /** Shown on the sign-in page as "Continue with {name}". Default `SSO`. */
  name?: string
  /**
   * The email domains of its people, for example `['example.com']`; subdomains count. Only an address there signs up,
   * or links to the account that has it.
   */
  domains: string[]
  /** The provider's metadata XML, or its entity ID, sign-in URL and signing certificate(s) (PEM; several while one rotates). */
  idp: { metadata: string } | { entityId: string; ssoUrl: string; certificate: string | string[] }
  /** The assertion's attribute names, when they are not `email`, `givenName`, `surname` and `displayName`. */
  attributes?: { email?: string; name?: string; firstName?: string; lastName?: string }
}

export type SsoOptions = { saml: SamlProvider[] }

// A bare host name, lowercased: no address, scheme, port, path or spaces.
const domainPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/

const checkIdp = (id: string, idp: SamlProvider['idp']) => {
  if ('metadata' in idp && typeof idp.metadata === 'string' && idp.metadata.trim()) return
  const manual = idp as Partial<{ entityId: string; ssoUrl: string; certificate: string | string[] }>
  if (!manual.entityId || !manual.ssoUrl || !manual.certificate || manual.certificate.length === 0) {
    throw new Error(`SAML provider "${id}": give idp.metadata, or all of idp.entityId, idp.ssoUrl and idp.certificate`)
  }
  if (!URL.canParse(manual.ssoUrl)) throw new Error(`SAML provider "${id}": idp.ssoUrl must be a URL, not "${manual.ssoUrl}"`)
}

/**
 * The providers with their defaults filled in: the name `SSO`, and the domains trimmed and lowercased. A malformed id,
 * an id used twice or by another sign-in provider (`takenIds`), no domains or a domain that is not a host name, and IdP
 * settings that are missing or not a URL are errors.
 */
export const resolveSamlProviders = (saml: SamlProvider[], takenIds: string[]) => {
  const seen = new Set<string>()
  return saml.map((provider) => {
    const { id } = provider
    if (!providerIdPattern.test(id)) throw new Error(`Invalid SAML provider id "${id}": use lowercase letters, digits or "-"`)
    if (seen.has(id)) throw new Error(`SAML provider id "${id}" is used twice`)
    if (takenIds.includes(id)) throw new Error(`SAML provider id "${id}" is already the id of another sign-in provider`)
    seen.add(id)
    const domains = (provider.domains ?? []).map((domain) => domain.trim().toLowerCase())
    if (domains.length === 0) throw new Error(`SAML provider "${id}": give the email domains of its people in domains`)
    const invalid = domains.find((domain) => !domainPattern.test(domain))
    if (invalid !== undefined) throw new Error(`SAML provider "${id}": domains must be host names such as example.com, not "${invalid}"`)
    checkIdp(id, provider.idp)
    return { ...provider, name: provider.name ?? 'SSO', domains }
  })
}

export type ResolvedSamlProvider = ReturnType<typeof resolveSamlProviders>[number]

/** The app's SP entity ID for a provider: its metadata URL on `baseURL`, the same on every origin. */
export const samlEntityId = (baseURL: string, id: string) => `${baseURL.replace(/\/$/, '')}${authBasePath}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(id)}`

/** The SSO plugin's endpoints for providers kept in its table, and its OIDC callback, which Protobase does not serve. */
export const samlDisabledPaths = ['/sso/register', '/sso/providers', '/sso/get-provider', '/sso/update-provider', '/sso/delete-provider', '/sso/request-domain-verification', '/sso/verify-domain', '/sso/callback']

const providerPaths = ['/sso/saml2/sp/acs/:providerId', '/sso/saml2/sp/slo/:providerId', '/sso/saml2/logout/:providerId']
const signInPath = '/sign-in/sso'
const metadataPath = '/sso/saml2/sp/metadata'
const oidcCallbackPath = '/sso/callback/:providerId'

/** Whether `path`, as `ctx.path` names it, is one of the SSO plugin's endpoints that name a provider. */
export const isSamlPath = (path: string | undefined) => path !== undefined && [signInPath, metadataPath, oidcCallbackPath, ...providerPaths].includes(path)

export type SamlRequest = { path: string; body?: unknown; query?: unknown; params?: Record<string, string | undefined> }

/**
 * Why a request to the SSO plugin is refused, or `undefined` when it names a configured provider: a request that names
 * none, or another one, would make the plugin look in its provider table. Sign-in names the provider by `providerId`
 * only, not by an address, domain or organization; the OIDC callback is always refused.
 */
export const samlRefusal = ({ path, body, query, params }: SamlRequest, ids: string[]) => {
  if (!isSamlPath(path)) return undefined
  if (path === oidcCallbackPath) return 'No OpenID Connect provider is configured'
  const named = path === signInPath ? (body as { providerId?: unknown } | undefined)?.providerId : path === metadataPath ? (query as { providerId?: unknown } | undefined)?.providerId : params?.providerId
  if (typeof named !== 'string' || !named) return 'Name the SAML provider by its providerId'
  return ids.includes(named) ? undefined : `No SAML provider ${named}`
}

/** Keeps every request to the SSO plugin to the configured providers; see `samlRefusal`. */
export const samlGuardPlugin = (ids: string[]) =>
  ({
    id: 'protobase-saml-guard',
    hooks: {
      before: [
        {
          matcher: (context) => isSamlPath(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const refusal = samlRefusal({ path: ctx.path, body: ctx.body, query: ctx.query, params: ctx.params }, ids)
            if (refusal) throw new APIError('NOT_FOUND', { message: refusal })
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin

/** Whether the address is at one of the domains, or a subdomain of one. */
export const emailInDomains = (email: string, domains: string[]) => {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).toLowerCase()
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}
