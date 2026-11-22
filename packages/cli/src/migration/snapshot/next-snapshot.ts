import { storeNamesList, type StoreModel } from '@protobase/server/internal'
import { lastStepsOf } from './auth-difference'
import type { Header } from './header'
import { modelHash, snapshotFormat, type Snapshot } from './snapshot-file'

/** The snapshot once the migration `endsAt` is applied: `auth`, the store's model then, and whether organizations are on now. */
export const nextSnapshot = (previous: Snapshot | undefined, auth: StoreModel | undefined, organizationsOn: boolean, endsAt: Snapshot['endsAt'], protobaseVersion: string): Snapshot => {
  const model = auth ? { auth } : {}
  return {
    format: snapshotFormat,
    protobaseVersion,
    endsAt,
    modelHash: modelHash(model),
    model,
    decisions: {
      modules: previous?.decisions.modules ?? { kept: [], archived: [] },
      organizations: { everOn: (previous?.decisions.organizations.everOn ?? false) || organizationsOn, defaultOrganization: previous?.decisions.organizations.defaultOrganization ?? null },
    },
    physical: auth ? { auth: storeNamesList(auth) } : {},
  }
}

/** The header of the migration a snapshot ends at. */
export const snapshotHeader = (snapshot: Snapshot, kind: Pick<Header, 'custom' | 'additive'> = { custom: false, additive: false }): Header => ({
  id: snapshot.endsAt.id,
  version: snapshot.protobaseVersion,
  steps: snapshot.model.auth ? lastStepsOf(snapshot.model.auth) : {},
  model: snapshot.modelHash,
  organizationsEverOn: snapshot.decisions.organizations.everOn,
  ...kind,
})
