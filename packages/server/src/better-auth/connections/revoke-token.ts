import { AddressRefusedError, pinnedRequest } from '../../webhooks/table/pinned-request'
import type { ConnectionClient } from './declared-connections'

/** The longest a provider gets to revoke a token: disconnecting does not wait on it any longer. */
const revokeTimeoutMs = 10_000

export type Revocation = { url: string; client: ConnectionClient | undefined; token: string; hint: 'refresh_token' | 'access_token'; allowPrivateAddresses: boolean }

// What a provider's endpoint that is down, slow or out of reach throws: the address refused, the time out, or a socket error.
const unreachable = (error: unknown) =>
  error instanceof AddressRefusedError || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || typeof (error as { code?: unknown }).code === 'string'))

/**
 * Revokes a token at its provider (RFC 7009), through the guarded request, which refuses a private address unless the
 * app allows them: whether the provider took it. A provider out of reach or refusing is false, so disconnecting still
 * deletes the token; nothing of the request or its answer is logged or returned, as both carry the token.
 */
export const revokeToken = async ({ url, client, token, hint, allowPrivateAddresses }: Revocation) => {
  const body = new URLSearchParams({ token, token_type_hint: hint, ...(client && { client_id: client.clientId, client_secret: client.clientSecret }) }).toString()
  const init = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(revokeTimeoutMs) }
  const response = await pinnedRequest(url, init, { allowPrivateAddresses }).catch((error: unknown) => {
    if (unreachable(error)) return
    throw error
  })
  if (!response) return false
  await response.body?.cancel()
  return response.ok
}
