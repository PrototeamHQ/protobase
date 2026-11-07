import type { Db } from '@protobase/query'
import type { AdminAuth } from '../../better-auth/create-auth'
import { workflowsSchema, type WorkflowsOptions } from '../options'
import { connectionRelease } from './connection-release'
import { connectionRevocations } from './connection-revocations'
import { connectionTexts } from './connection-texts'
import { parkTriggers } from './connection-triggers'

// Linking accounts and listing what waits on them are the served app's, through its endpoints, never a tool's.
const served = async () => {
  throw new Error('Not implemented: only the served app links connected accounts and lists their triggers')
}

/**
 * For a host that deletes users without serving the app, such as the CLI: the part of the listener the workflow engine
 * sets on `auth`'s connections that deleting a user needs, so their connected accounts park their triggers and a
 * revocation the provider did not take is queued, rather than the deletion refused as while the app starts.
 */
export const releaseConnectionsWithUsers = (auth: AdminAuth, options: WorkflowsOptions, { db, report }: { db: Db; report: (error: Error) => void }) => {
  if (auth.connections.declared.length === 0) return
  const schema = workflowsSchema(options)
  auth.connections.events.set({
    linked: served,
    needsSignIn: served,
    uses: served,
    disconnected: parkTriggers(() => db, schema, connectionTexts(undefined)),
    ...connectionRelease({ db: () => db, revocations: connectionRevocations(schema, auth.connections.revokeSealed), report }),
  })
}
