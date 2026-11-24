import { jobsModule } from '../jobs/jobs-module'
import type { ModuleModel, SchemaModule } from './schema-module'
import { latestModel } from './module-difference'

// The built-in schemas that are modules with step chains, in the order their statements are written. Each other
// built-in schema still compares itself with the database (`migrationParts`) until it moves here.
export const schemaModules = { jobs: jobsModule } satisfies Record<string, SchemaModule>

export type SchemaModuleId = keyof typeof schemaModules

/** The schema modules' part of a model, by module: in the snapshot, the record and the runtime alike. */
export type ModulesModel = Partial<Record<SchemaModuleId, ModuleModel>>

/** The model of each of `ids` this version of Protobase reads. */
export const latestModules = (ids: readonly SchemaModuleId[]): ModulesModel => Object.fromEntries(ids.map((id) => [id, latestModel(schemaModules[id])]))
