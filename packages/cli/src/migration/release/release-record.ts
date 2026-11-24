import type { AdminAuth } from '@protobase/server'
import { modelHash, recordsRuntimeModel, runtimeModel, storeNamesList } from '@protobase/server/internal'
import { recordBlock } from '../record/record-block'
import type { ReleaseStep } from './release-steps'

/**
 * The row that records a release in the record of migrations once its steps are applied, as a file's record block
 * does: the model this release reads with `auth`, additive when only the auth store's steps, which only add, apply.
 * `undefined` when the record has the model already and no step applies.
 */
export const releaseRecord = async (auth: AdminAuth, steps: ReleaseStep[], protobaseVersion: string, id: string): Promise<ReleaseStep | undefined> => {
  if (steps.length === 0 && (await recordsRuntimeModel(auth))) return
  const model = runtimeModel(auth)
  const row = {
    id,
    number: null,
    name: `release ${protobaseVersion}`,
    protobaseVersion,
    model,
    modelHash: modelHash(model),
    physical: { auth: storeNamesList(model.auth!) },
    additive: steps.every(({ name }) => name === 'auth'),
    completed: true,
  }
  return { name: 'record', title: 'The row that records this release in the record of migrations', sql: recordBlock(row, null) }
}
