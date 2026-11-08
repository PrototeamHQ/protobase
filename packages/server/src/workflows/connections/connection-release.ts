import type { Db } from '@protobase/query'
import type { ConnectionListener } from '../../better-auth/connections/connection-events'
import type { connectionRevocations } from './connection-revocations'

type ReleaseInput = { db: () => Db; revocations: ReturnType<typeof connectionRevocations> | undefined; report: (error: Error) => void }

/** What the workflows do with the token of an account that is disconnected, or whose user is deleted: queue it when the provider did not take it, and report one left valid. */
export const connectionRelease = ({ db, revocations, report }: ReleaseInput): Pick<ConnectionListener, 'revokeLater' | 'unrevoked'> => ({
  revokeLater: async (revocation) => revocations?.revokeLater(db(), revocation),
  // A token left valid at its provider is the app's to look into: reported by its reason, never with the token or the error that stopped it.
  unrevoked: ({ provider, reason }) => report(new Error(`A disconnected account's token of ${provider} is not revoked: ${reason}`)),
})
