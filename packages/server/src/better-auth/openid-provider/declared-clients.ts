import { SafeUrlSchema } from '@better-auth/core/utils/redirect-uri'
import * as z from 'zod'
import { onAudienceHost, type AudiencePattern } from './audience-patterns'

/**
 * A client the app declares in `auth.openIdProvider.clients`, with the fields the operator API registers one with and
 * the id written here, so a phone app ships with it. Public clients only: they authenticate with PKCE, never a secret.
 */
export type DeclaredClient = {
  /** The client's id, as the client sends it. */
  clientId: string
  /** Shown to nobody but the developer: no consent page asks for the client. */
  name: string
  /** Every address the client may be sent back to, matched exactly. */
  redirectUris: string[]
  /** Only `public`: a declared client has no secret. */
  type: 'public'
  /** May exchange its access token for an ID token of another client or an origin of `audiences`. Default false. */
  exchange?: boolean
}

/** The provider's record of where a declared client comes from (its `clientDiscoveryId`). */
export const declaredClientsSource = 'app-config'

/** Whether `client` is the stored record of a declared client, whether or not the config still declares it. */
export const isDeclaredClient = (client: { clientDiscoveryId?: string | null } | null | undefined) => client?.clientDiscoveryId === declaredClientsSource

const declaredClient = z.strictObject({
  clientId: z.string().min(1),
  name: z.string().trim().min(1),
  // The provider's own rule for a redirect URI, so a client the app starts with can always sign in.
  redirectUris: z.array(SafeUrlSchema).min(1),
  type: z.literal('public', { error: 'must be public: a declared client has no secret' }),
  exchange: z.boolean().optional(),
})

/** `clients` checked: the operator API's fields, unique ids, and no redirect URI on a host of `audiences`. */
export const resolveDeclaredClients = (clients: readonly DeclaredClient[], audiences: readonly AudiencePattern[]): DeclaredClient[] =>
  clients.map((input, index) => {
    const where = `auth.openIdProvider.clients[${index}]`
    const parsed = declaredClient.safeParse(input)
    if (!parsed.success) throw new Error(`${where}: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'client'} ${issue.message}`).join('; ')}`)
    const client = parsed.data
    if (clients.findIndex((other) => other.clientId === client.clientId) !== index) throw new Error(`${where}: client id "${client.clientId}" is declared twice`)
    const onHost = client.redirectUris.find((uri) => onAudienceHost(audiences, uri))
    if (onHost) throw new Error(`${where}: redirect URI ${onHost} is on a host of auth.openIdProvider.audiences, which only the token exchange issues tokens for`)
    return client
  })
