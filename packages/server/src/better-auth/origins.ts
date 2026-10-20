export const originsVariable = 'PROTOBASE_ORIGINS'

/** The comma-separated list in an environment variable, blanks left out; empty when it is unset. */
export const readList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** The origins the platform passes in `PROTOBASE_ORIGINS`, comma separated; empty when it is unset. */
export const readOrigins = (env: Record<string, string | undefined>) => readList(env[originsVariable])

const originOf = (value: string, what: string) => {
  if (!URL.canParse(value)) throw new Error(`${what} must be a URL such as https://admin.example.com, not "${value}"`)
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`${what} must be an http or https URL, not "${value}"`)
  return url
}

/**
 * The origins the app is served on besides `baseURL`, as `https://host[:port]`, without `baseURL`'s own and without
 * repeats. Each must be a URL with the scheme of `baseURL`, since Better Auth builds every host's URLs with one scheme.
 */
export const resolveOrigins = (baseURL: string, origins: string[]) => {
  const base = originOf(baseURL, 'baseURL')
  const resolved = origins.map((origin) => {
    const url = originOf(origin, `The origin "${origin}"`)
    if (url.protocol !== base.protocol) throw new Error(`The origin "${origin}" must use ${base.protocol.slice(0, -1)}, like baseURL`)
    return url.origin
  })
  return [...new Set(resolved)].filter((origin) => origin !== base.origin)
}

/**
 * Every origin the app is served on: `baseURL`'s, then the others from `resolveOrigins`. The only origins a passkey's
 * answer may name, and the list `/.well-known/webauthn` serves; never empty.
 */
export const appOrigins = (baseURL: string, origins: string[]) => [new URL(baseURL).origin, ...origins]

/**
 * Better Auth's `baseURL` for an app on several origins: each request is answered for its own host when that is one of
 * them (its links, such as a password reset, and its passkey and sign-in callbacks then stay on that host), and for
 * `baseURL` otherwise. With no other origins it is `baseURL` itself.
 */
export const multiHostBaseURL = (baseURL: string, origins: string[]) => {
  if (origins.length === 0) return baseURL
  const base = new URL(baseURL)
  return { allowedHosts: [base.host, ...origins.map((origin) => new URL(origin).host)], fallback: baseURL, protocol: base.protocol === 'https:' ? ('https' as const) : ('http' as const) }
}

/** Where browsers read which origins may use the app's passkeys (WebAuthn Related Origin Requests). */
export const webauthnPath = '/.well-known/webauthn'

/**
 * Where MCP clients discover how to sign in: the OAuth authorization server's metadata, and the protected resource's
 * (also below it, at the resource's path). Every bundle sends them to the API, which answers them with MCP on.
 */
export const oauthWellKnownPaths = ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']

/** Whether `path` is one of `oauthWellKnownPaths` or below one. */
export const isOAuthWellKnownPath = (path: string) => oauthWellKnownPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
