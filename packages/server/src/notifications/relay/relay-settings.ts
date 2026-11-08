/** Where the relay sender sends, and the workspace's credential, sent as a bearer token. */
export type RelaySettings = { url: URL; credential: string }

export const relayUrlVariable = 'PROTOBASE_PUSH_RELAY_URL'
export const relayCredentialVariable = 'PROTOBASE_PUSH_RELAY_CREDENTIAL'

// A bearer token as HTTP writes one (RFC 6750's b64token), of a bounded length.
const bearerToken = /^[A-Za-z0-9._~+/-]{16,1024}=*$/

// An https URL with no userinfo, query or fragment, so the credential reaches only the host it names.
const relayUrl = (text: string) => {
  const url = URL.canParse(text) ? new URL(text) : undefined
  if (!url || url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || text.includes('#') || text.includes('?')) {
    throw new Error(`${relayUrlVariable} is not an https URL without a user, query or fragment`)
  }
  // The send path goes under the URL's own path, whether or not it ends in a slash.
  return new URL(url.pathname.endsWith('/') ? url.href : `${url.href}/`)
}

/**
 * The relay settings from `PROTOBASE_PUSH_RELAY_URL` and `PROTOBASE_PUSH_RELAY_CREDENTIAL`; `undefined` when both are
 * unset or blank, which turns the relay off. Only one of them set, a URL that is not https, or a credential that is no
 * bearer token is a configuration error naming the variable, never its value, so the server stops at startup.
 */
export const readRelaySettings = (env: Record<string, string | undefined>): RelaySettings | undefined => {
  const url = env[relayUrlVariable]?.trim()
  const credential = env[relayCredentialVariable]?.trim()
  if (!url && !credential) return
  if (!url || !credential) throw new Error(`${relayUrlVariable} and ${relayCredentialVariable} must be set together, or neither`)
  if (!bearerToken.test(credential)) throw new Error(`${relayCredentialVariable} is not a bearer token: 16 to 1024 letters, digits and -._~+/`)
  return { url: relayUrl(url), credential }
}
