import type { ModuleModel, SchemaModule } from './schema-module'

/** The model of `module` with every step and replaceable this version of Protobase ships. */
export const latestModel = (module: SchemaModule): ModuleModel => ({
  lastStep: module.steps.at(-1)!.step,
  replaceables: Object.fromEntries(module.replaceables.map(({ name, version }) => [name, version])),
})

/**
 * What brings `module` from `from`, `undefined` when the database has none of it, to its latest model: the steps after
 * its last, then each replaceable at another version, each under its title; `sql` undefined when nothing differs.
 * `breaks` says what of it the code before does not run on, one line each: a step that does not only add, and a
 * replaceable replaced from a version older than its `compatibleFrom`; none when it is additive.
 */
export const moduleDifference = (module: SchemaModule, from: ModuleModel | undefined) => {
  const latest = latestModel(module)
  const newer = from && (from.lastStep > latest.lastStep || Object.entries(from.replaceables).some(([name, version]) => version > (latest.replaceables[name] ?? 0)))
  if (newer) throw new Error(`${module.label} is newer than this version of Protobase writes: upgrade Protobase`)
  const steps = module.steps.filter(({ step }) => step > (from?.lastStep ?? 0))
  const replaced = module.replaceables.filter(({ name, version }) => from?.replaceables[name] !== version)
  const parts = [...steps, ...replaced].map(({ title, sql }) => `-- ${title}.\n${sql.trim()}`)
  const breakingSteps = steps.filter(({ additive }) => !additive).map(({ step, name }) => `its step ${step} (${name}) does not only add`)
  const olderReplaced = replaced.flatMap(({ name, version, compatibleFrom }) => {
    const had = from?.replaceables[name]
    return had !== undefined && had < compatibleFrom ? [`it replaces its ${name} at version ${had} with version ${version}, which the code before does not run on`] : []
  })
  return { sql: parts.length > 0 ? parts.join('\n\n') : undefined, breaks: [...breakingSteps, ...olderReplaced] }
}
