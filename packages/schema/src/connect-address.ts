/**
 * The path of the connect page, where someone signs in and allows an outside app, such as an MCP client, to act as
 * them. The OAuth provider sends people there with the authorization request it signed as the page's query.
 */
export const connectRoute = '/-/connect'

/** The names of the connect page's query parameters the page reads itself; the rest belong to the signed request. */
export const connectParams = {
  /** The signature the OAuth provider puts on the request, without which the query is no request. */
  signature: 'sig',
} as const

/** Where the connect page is: the signed authorization request, as the provider wrote it, when the query holds one. */
export type ConnectAddress = {
  /** The whole query, without its `?`, which the page hands back to the provider as it is. */
  oauthQuery?: string
}

/** The path of the connect page for a signed authorization request, `oauthQuery` being its query without the `?`. */
export const connectPath = (oauthQuery?: string) => (oauthQuery ? `${connectRoute}?${oauthQuery}` : connectRoute)

/** The connect page's signed request, read from its query (`location.search`, with or without the `?`). */
export const readConnectAddress = (search: string): ConnectAddress => {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).has(connectParams.signature) ? { oauthQuery: query } : {}
}
