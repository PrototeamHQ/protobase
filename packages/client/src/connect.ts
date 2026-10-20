import { AuthError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/** What a client says about itself, as the server hands it to anyone: its id and the name it gave itself. */
export type ConnectingClient = { client_id: string; client_name?: string }

// The provider answers in OAuth's words (`error`, `error_description`), Protobase's own refusals in Better Auth's (`code`, `message`).
type ProviderError = { message?: string; status?: number; code?: string; error?: string; error_description?: string } | null | undefined

const connectError = (error: ProviderError, fallback: string) =>
  new AuthError(error?.message || error?.error_description || fallback, error?.status ?? 500, error?.code ?? error?.error)

/**
 * The calls of the connect page, where someone allows an outside app, such as an MCP client, to act as them. Each
 * takes the signed request the server sent the page (`oauthQuery`, its query) and resolves with where to go next, or
 * rejects with `AuthError` carrying the code: `invalid_signature` for an expired request, `STAFF_CANNOT_CONNECT`,
 * `SIGN_IN_SETUP_REQUIRED` or `ADDRESS_NOT_VERIFIED`.
 */
export const connectClient = (client: BetterAuthClient) => ({
  /** The client asking, by its id. */
  client: async (clientId: string) => {
    const { data, error } = await client.$fetch<ConnectingClient>('/oauth2/public-client', { query: { client_id: clientId } })
    if (error || !data) throw connectError(error, 'Could not read the app asking')
    return data
  },

  /** Picks the request up for the signed-in person: the connect page again to ask them, or the client when they allowed it before. */
  resume: async (oauthQuery: string) => {
    const { data, error } = await client.$fetch<{ url: string }>('/oauth2/continue', { method: 'POST', body: { postLogin: true, oauth_query: oauthQuery } })
    if (error || !data?.url) throw connectError(error, 'Could not go on with the request')
    return { url: data.url }
  },

  /** Allows the client (`accept`) or not: where to send the browser, the client with a code or with `access_denied`. */
  answer: async (accept: boolean, oauthQuery: string) => {
    const { data, error } = await client.$fetch<{ url: string }>('/oauth2/consent', { method: 'POST', body: { accept, oauth_query: oauthQuery } })
    if (error || !data?.url) throw connectError(error, 'Could not answer the request')
    return { url: data.url }
  },
})

export type ConnectClient = ReturnType<typeof connectClient>
