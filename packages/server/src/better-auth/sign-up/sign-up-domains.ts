import { readList } from '../origins'
import { domainPattern, emailInDomains } from '../saml-sign-in'

/** The email domains open sign-up takes, comma separated, which a platform passes in place of `signUp.domains`. */
export const signUpDomainsVariable = 'PROTOBASE_SIGN_UP_DOMAINS'

/**
 * The email domains open sign-up takes, trimmed and lowercased: `PROTOBASE_SIGN_UP_DOMAINS` when it is set, even to
 * nothing, else `configured`; `undefined` when neither names any, for every address. An empty list takes none, so open
 * sign-up is off. A domain that is not a host name is an error.
 */
export const resolveSignUpDomains = (configured: string[] | undefined, env: Record<string, string | undefined>) => {
  const given = env[signUpDomainsVariable] === undefined ? configured : readList(env[signUpDomainsVariable])
  if (given === undefined) return
  const domains = given.map((domain) => domain.trim().toLowerCase())
  const invalid = domains.find((domain) => !domainPattern.test(domain))
  if (invalid !== undefined) throw new Error(`signUp.domains must be host names such as example.com, not "${invalid}"`)
  return domains
}

/** Whether open sign-up takes the address: every one without a list, else one at a listed domain or a subdomain of one. */
export const signUpTakes = (email: string, domains: string[] | undefined) => domains === undefined || emailInDomains(email, domains)
