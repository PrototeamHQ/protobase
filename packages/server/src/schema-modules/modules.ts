import { changesModule } from '../changes/changes-module'
import { historyModule } from '../history/history-module'
import { jobsModule } from '../jobs/jobs-module'
import { noticesModule } from '../live/notices-module'
import type { ModuleInput, ModuleModel, SchemaModule } from './schema-module'
import { latestModel } from './module-difference'

// The built-in schemas that are modules with step chains, in the order their statements are written. Each other
// built-in schema still compares itself with the database (`migrationParts`) until it moves here.
export const schemaModules = { jobs: jobsModule, changes: changesModule, history: historyModule, notices: noticesModule } satisfies Record<string, SchemaModule>

export type SchemaModuleId = keyof typeof schemaModules

/** The schema modules' part of a model, by module: in the snapshot, the record and the runtime alike. */
export type ModulesModel = Partial<Record<SchemaModuleId, ModuleModel>>

/** The schema modules an app needs, each with what it gives the module (`neededModules`), in their order. */
export type ModuleTargets = Partial<Record<SchemaModuleId, ModuleInput>>

/** The modules of `targets`, in their order. */
export const targetIds = (targets: ModuleTargets) => (Object.keys(schemaModules) as SchemaModuleId[]).filter((id) => targets[id])

/** The model of each module of `targets` this version of Protobase reads. */
export const latestModules = (targets: ModuleTargets): ModulesModel => Object.fromEntries(targetIds(targets).map((id) => [id, latestModel(schemaModules[id], targets[id])]))
