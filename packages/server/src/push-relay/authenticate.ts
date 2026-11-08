import { unauthorized } from '../problem'
import { parseCredential, secretMatches, type StoredCredential } from './credential'
import type { RelayStore } from './store'

const refused = () => unauthorized('Send with the relay credential of your workspace as a bearer token')

/**
 * The credential an `Authorization: Bearer` header carries, or a 401 alike for none, a malformed one, an unknown id and
 * a wrong secret. The secret is compared in constant time, and nothing of it is logged or answered.
 */
export const authenticatedCredential = async (store: RelayStore, header: string | undefined): Promise<StoredCredential> => {
  const bearer = /^Bearer (\S+)$/.exec(header ?? '')
  const given = bearer ? parseCredential(bearer[1]!) : undefined
  if (!given) throw refused()
  const stored = await store.credential(given.id)
  if (!stored || !secretMatches(stored, given.secret)) throw refused()
  return stored
}
