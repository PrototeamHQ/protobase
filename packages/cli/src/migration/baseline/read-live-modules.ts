import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { schemaModules, type ModulesModel, type SchemaModuleId } from '@protobase/server/internal'

/** What the database at `url` has of each schema module of `ids`, read once from its catalogue; a module it lacks is left out. */
export const readLiveModules = async (url: string, ids: readonly SchemaModuleId[]): Promise<ModulesModel> => {
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) })
  try {
    const found: ModulesModel = {}
    for (const id of ids) {
      const model = await schemaModules[id].read(db)
      if (model) found[id] = model
    }
    return found
  } finally {
    await db.destroy()
  }
}

/** The lines that say what a baseline found of the schema modules, one each. */
export const describedModules = (modules: ModulesModel) =>
  (Object.entries(modules) as [SchemaModuleId, NonNullable<ModulesModel[SchemaModuleId]>][]).map(([id, { lastStep, replaceables }]) => {
    const module = schemaModules[id]
    const versions = Object.entries(replaceables).map(([name, version]) => `, its ${name} at version ${version}`).join('')
    return `-- ${module.title}: at step ${lastStep} (${module.steps[lastStep - 1]!.name})${versions}.`
  })
