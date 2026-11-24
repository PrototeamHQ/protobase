import { modelHash, recordsRuntimeModel, runtimeModel, storeNamesList } from '@protobase/server/internal'
import type { MigrationProject } from '../migration-project'
import { recordBlock } from '../record/record-block'
import type { ReleaseStep } from './release-steps'

/**
 * The row that records a release in the record of migrations once its steps are applied, as a file's record block
 * does: the model this release reads with the project's auth and schema modules, additive when only the auth store's
 * steps, which only add, and schema modules' statements the code before runs on apply. `undefined` when the release
 * reads nothing of the record, or the record holds its model already and no step applies.
 */
export const releaseRecord = async (project: Pick<MigrationProject, 'auth' | 'modules' | 'db'>, steps: ReleaseStep[], protobaseVersion: string, id: string): Promise<ReleaseStep | undefined> => {
  const model = runtimeModel(project.auth, project.modules)
  if (!model.auth && !model.modules) return
  if (steps.length === 0 && (await recordsRuntimeModel(project.db, model))) return
  const row = {
    id,
    number: null,
    name: `release ${protobaseVersion}`,
    protobaseVersion,
    model,
    modelHash: modelHash(model),
    physical: model.auth ? { auth: storeNamesList(model.auth) } : {},
    additive: steps.every(({ name, breaks }) => name === 'auth' || (breaks !== undefined && breaks.length === 0)),
    completed: true,
  }
  return { name: 'record', title: 'The row that records this release in the record of migrations', sql: recordBlock(row, null) }
}
