import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import type { ResolvedConnection } from './declared-connections'
import { revokeToken } from './revoke-token'

/** The app's secret as Better Auth keeps it, with the versions it rotated through. */
export type SecretKey = Parameters<typeof symmetricEncrypt>[0]['key']

/** A revocation the provider did not take, to try again: its token encrypted with the app's secret. */
export type SealedRevocation = { provider: string; hint: 'refresh_token' | 'access_token'; token: string }

/** What trying a sealed revocation again came to. */
export type SealedOutcome = 'revoked' | 'refused' | 'unreadable'

/** Encrypts a token with the app's current secret, so only the app reads it back. */
export const sealToken = (key: SecretKey, token: string) => symmetricEncrypt({ key, data: token })

/**
 * A stored token decrypted, or undefined when it does not decrypt. The decrypt reads nothing outside: whatever it
 * throws, as after the secret it was sealed with was retired, the token cannot be read with this app's secret.
 */
export const readable = async (decrypt: () => Promise<string>) => {
  try {
    return await decrypt()
  } catch (error) {
    if (error instanceof Error) return
    throw error
  }
}

/**
 * Tries a sealed revocation again, at the revocation URL of the connection whose provider it names, as the app's
 * config states it now: `unreadable` when the token no longer decrypts or no connection of that provider revokes.
 */
export const sealedRevoker = (connections: readonly ResolvedConnection[], key: () => Promise<SecretKey>, allowPrivateAddresses: boolean) => async ({ provider, hint, token }: SealedRevocation): Promise<SealedOutcome> => {
  const connection = connections.find((candidate) => candidate.providerId === provider && candidate.revocationUrl)
  if (!connection?.revocationUrl) return 'unreadable'
  const secret = await key()
  const plain = await readable(() => symmetricDecrypt({ key: secret, data: token }))
  if (plain === undefined) return 'unreadable'
  return (await revokeToken({ url: connection.revocationUrl, client: connection.client, token: plain, hint, allowPrivateAddresses })) ? 'revoked' : 'refused'
}
