import { moduleNameChanges } from '../schema-modules/module-difference'
import type { ModuleModel } from '../schema-modules/schema-module'
import { schemaModules, type ModulesModel, type SchemaModuleId } from '../schema-modules/modules'

const stepLabel = (id: SchemaModuleId, step: number) => `step ${step} (${schemaModules[id].steps[step - 1]?.name ?? 'unknown'})`

// What of each resource's objects the runtime needs that the database lacks or has otherwise, one line each.
const resourceNeeds = (label: string, had: ModuleModel, needed: ModuleModel) =>
  Object.entries(needed.resources ?? {}).flatMap(([name, entries]) =>
    Object.entries(entries).flatMap(([key, entry]) => {
      const found = had.resources?.[name]?.[key]
      if (!found) return [`${label} lacks its ${name} of ${key}`]
      return found.version === entry.version && found.digest === entry.digest ? [] : [`${label} has its ${name} of ${key} otherwise than this version writes them for the config`]
    }),
  )

/** What the runtime needs of the schema modules that the database's model lacks, has older or names otherwise, one line each. */
export const moduleNeeds = (database: ModulesModel | undefined, runtime: ModulesModel) =>
  (Object.entries(runtime) as [SchemaModuleId, ModuleModel][]).flatMap(([id, needed]) => {
    const { label } = schemaModules[id]
    const had = database?.[id]
    if (!had) return [`the database lacks ${label}, which this version needs at ${stepLabel(id, needed.lastStep)}`]
    const steps = had.lastStep < needed.lastStep ? [`${label} is at ${stepLabel(id, had.lastStep)}, and this version needs ${stepLabel(id, needed.lastStep)}`] : []
    const replaced = Object.entries(needed.replaceables).flatMap(([name, version]) => {
      const found = had.replaceables[name]
      if (found === undefined) return [`${label} lacks its ${name}, which this version needs at version ${version}`]
      return found < version ? [`${label} has its ${name} at version ${found}, and this version needs version ${version}`] : []
    })
    const renamed = moduleNameChanges(schemaModules[id], had.names, needed.names ?? {}, 'the database')
    return [...steps, ...replaced, ...renamed, ...resourceNeeds(label, had, needed)]
  })
