import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { schemaModules, targetIds, type ModuleTargets, type ModulesModel, type SchemaModuleId } from '@protobase/server/internal'

/** What the database at `url` has of each schema module of `targets`, read once from its catalogue; a module it lacks is left out. */
export const readLiveModules = async (url: string, targets: ModuleTargets): Promise<ModulesModel> => {
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) })
  try {
    const found: ModulesModel = {}
    for (const id of targetIds(targets)) {
      const model = await schemaModules[id].read(db, targets[id]!)
      if (model) found[id] = model
    }
    return found
  } finally {
    await db.destroy()
  }
}

/** The lines that say what a baseline found of the schema modules, one each. */
export const describedModules = (modules: ModulesModel) =>
  (Object.entries(modules) as [SchemaModuleId, NonNullable<ModulesModel[SchemaModuleId]>][]).map(([id, { lastStep, replaceables, resources }]) => {
    const module = schemaModules[id]
    const versions = Object.entries(replaceables).map(([name, version]) => `, its ${name} at version ${version}`).join('')
    const perResource = Object.entries(resources ?? {}).map(([name, entries]) => `, its ${name} of ${Object.keys(entries).join(', ')}`).join('')
    // A module may have objects of its resources before its first step, such as formula columns without the rollups schema.
    const step = lastStep === 0 ? 'before its first step' : `at step ${lastStep} (${module.steps[lastStep - 1]!.name})`
    return `-- ${module.title}: ${step}${versions}${perResource}.`
  })
