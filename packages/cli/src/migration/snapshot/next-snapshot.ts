import type { DefaultOrganization } from '@protobase/server'
import { storeNamesList, type ModulesModel, type StoreModel } from '@protobase/server/internal'
import { lastStepsOf } from './auth-difference'
import type { Header } from './header'
import { modelHash, snapshotFormat, type Snapshot } from './snapshot-file'

// The user table, by its name in the store's schema, when the store reads it through a view over another system's.
const externalUser = (auth: StoreModel | undefined) => {
  const user = auth?.modules.auth?.tables.user
  if (!auth?.userKeyTable || !user) return []
  return [auth.schema === null ? user.name : `${auth.schema}.${user.name}`]
}

/** What the config says of organizations: whether they are on, and their default organization when it gives one. */
export type OrganizationsNow = { on: boolean; default?: DefaultOrganization }

/**
 * The snapshot once the migration `endsAt` is applied: `auth`, the store's model then, `modules`, the schema modules'
 * then, and what the config says of organizations now. It goes on from `before`, the decisions of the snapshot before it, which a baseline reads from
 * the database.
 */
export const nextSnapshot = (before: Snapshot['decisions'] | undefined, auth: StoreModel | undefined, modules: ModulesModel | undefined, organizations: OrganizationsNow, endsAt: Snapshot['endsAt'], protobaseVersion: string): Snapshot => {
  const model = { ...(auth && { auth }), ...(modules && { modules }) }
  const external = [...new Set([...(before?.external ?? []), ...externalUser(auth)])].sort()
  return {
    format: snapshotFormat,
    protobaseVersion,
    endsAt,
    modelHash: modelHash(model),
    model,
    decisions: {
      modules: before?.modules ?? { kept: [], archived: [] },
      organizations: {
        everOn: (before?.organizations.everOn ?? false) || organizations.on,
        defaultOrganization: organizations.default ?? before?.organizations.defaultOrganization ?? null,
      },
      ...(external.length > 0 && { external }),
    },
    physical: auth ? { auth: storeNamesList(auth) } : {},
  }
}

/** The header of the migration a snapshot ends at. */
export const snapshotHeader = (snapshot: Snapshot, kind: Pick<Header, 'custom' | 'additive' | 'breaksOlderCode'> = { custom: false, additive: false, breaksOlderCode: false }): Header => ({
  id: snapshot.endsAt.id,
  version: snapshot.protobaseVersion,
  steps: snapshot.model.auth ? lastStepsOf(snapshot.model.auth) : {},
  ...(snapshot.model.modules && { modules: snapshot.model.modules }),
  model: snapshot.modelHash,
  organizationsEverOn: snapshot.decisions.organizations.everOn,
  ...kind,
})
