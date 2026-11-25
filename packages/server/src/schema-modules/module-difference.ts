import { resourceDifference, resourceEntry, wantedResources } from './resource-difference'
import { noInput, type ModuleInput, type ModuleModel, type ModuleNames, type ResourceEntry, type SchemaModule } from './schema-module'

// The model leaves out `names` and `resources` when a module has none, so a module without them reads as before.
const withParts = (model: ModuleModel, names: ModuleNames, resources: Record<string, Record<string, ResourceEntry>>): ModuleModel => {
  const used = Object.fromEntries(Object.entries(resources).filter(([, entries]) => Object.keys(entries).length > 0))
  return { ...model, ...(Object.keys(names).length > 0 && { names }), ...(Object.keys(used).length > 0 && { resources: used }) }
}

/**
 * The model of `module` with every step and replaceable this version of Protobase ships, and the objects of each
 * resource of `input` that needs them: what the runtime reads.
 */
export const latestModel = (module: SchemaModule, input: ModuleInput = noInput): ModuleModel => {
  const resources = Object.fromEntries(
    module.resourceReplaceables.map((replaceable) => [
      replaceable.name,
      Object.fromEntries(wantedResources(input.resources[replaceable.name] ?? {}).map(([key, given]) => [key, resourceEntry(replaceable, input.names, given)])),
    ]),
  )
  const model = { lastStep: module.steps.at(-1)!.step, replaceables: Object.fromEntries(module.replaceables.map(({ name, version }) => [name, version])) }
  return withParts(model, input.names, resources)
}

/**
 * How the names `after` changes the ones `before`, from `source`, has, one line each: a module's names cannot change
 * once its statements are written. A name `before` lacks is new rather than changed.
 */
export const moduleNameChanges = (module: SchemaModule, before: ModuleNames | undefined, after: ModuleNames, source: string) =>
  Object.entries(before ?? {}).flatMap(([role, name]) => (after[role] === name ? [] : [`${module.label}'s ${role} is "${name}" in ${source} and "${after[role] ?? ''}" now`]))

const newerThanShipped = (module: SchemaModule, from: ModuleModel) => {
  const latest = latestModel(module)
  const resources = module.resourceReplaceables.some(({ name, version }) => Object.values(from.resources?.[name] ?? {}).some((entry) => entry.version > version))
  return from.lastStep > latest.lastStep || Object.entries(from.replaceables).some(([name, version]) => version > (latest.replaceables[name] ?? 0)) || resources
}

/**
 * What brings `module` from `from`, `undefined` when the database has none of it, to its latest model for `input`: the
 * steps after its last, then each replaceable at another version, then the removals of each resource's objects, the
 * last resource replaceable's first, then each resource's objects that differ (`resourceDifference`), each under its
 * title; `sql` undefined when nothing differs. `after`: what those objects rebuild once the transaction commits, the
 * migration's `.after.sql`; undefined when they rebuild nothing. `breaks` says what of it the code before does not run
 * on, one line each: a step that does not only add, and a replaceable replaced from a version older than its
 * `compatibleFrom`; none when it is additive. `model` is the module once it is applied, which keeps the objects of
 * resources kept for older code. Refuses a name of `input` that differs from the one `from` has.
 */
export const moduleDifference = (module: SchemaModule, input: ModuleInput, from: ModuleModel | undefined) => {
  if (from && newerThanShipped(module, from)) throw new Error(`${module.label} is newer than this version of Protobase writes: upgrade Protobase`)
  const renamed = moduleNameChanges(module, from?.names, input.names, 'the snapshot')
  if (renamed.length > 0) throw new Error(`Not implemented: renaming what a migration made: ${renamed.join('; ')}. Name it as before in the config`)
  const steps = module.steps.filter(({ step }) => step > (from?.lastStep ?? 0))
  const replaced = module.replaceables.filter(({ name, version }) => from?.replaceables[name] !== version)
  const perResource = module.resourceReplaceables.map((replaceable) => ({
    name: replaceable.name,
    ...resourceDifference(replaceable, input.names, input.resources[replaceable.name] ?? {}, from?.resources?.[replaceable.name] ?? {}),
  }))
  // Removals go in the reverse of the order objects are made in, so what reads another object goes before it.
  const drops = perResource.toReversed().flatMap(({ drops }) => drops)
  const parts = [...[...steps, ...replaced].map(({ title, sql }) => `-- ${title}.\n${sql(input.names).trim()}`), ...drops, ...perResource.flatMap(({ writes }) => writes)]
  const after = perResource.flatMap(({ after }) => after)
  const breakingSteps = steps.filter(({ additive }) => !additive).map(({ step, name }) => `its step ${step} (${name}) does not only add`)
  const olderReplaced = replaced.flatMap(({ name, version, compatibleFrom }) => {
    const had = from?.replaceables[name]
    return had !== undefined && had < compatibleFrom ? [`it replaces its ${name} at version ${had} with version ${version}, which the code before does not run on`] : []
  })
  const model = withParts(latestModel(module), input.names, Object.fromEntries(perResource.map(({ name, entries }) => [name, entries])))
  return { sql: parts.length > 0 ? parts.join('\n\n') : undefined, after: after.length > 0 ? after.join('\n\n') : undefined, breaks: [...breakingSteps, ...olderReplaced, ...perResource.flatMap(({ breaks }) => breaks)], model }
}

/**
 * What becomes of `module` once the config no longer needs it: its tables and replaceables stay as the migrations
 * left them, and each resource's objects go, as no resource needs them, which breaks older code (`breaks`), but for
 * those a replaceable without `drop` leaves; `sql` undefined when it has none. It leaves nothing for after the
 * transaction.
 */
export const retiredDifference = (module: SchemaModule, from: ModuleModel) => {
  const names = from.names ?? {}
  const dropped = module.resourceReplaceables.map((replaceable) => resourceDifference(replaceable, names, {}, from.resources?.[replaceable.name] ?? {}))
  const parts = dropped.toReversed().flatMap(({ drops }) => drops)
  const { resources: _, names: __, ...rest } = from
  const model = withParts(rest, names, Object.fromEntries(module.resourceReplaceables.map(({ name }, index) => [name, dropped[index]!.entries])))
  return { sql: parts.length > 0 ? parts.join('\n\n') : undefined, after: undefined, breaks: dropped.flatMap(({ breaks }) => breaks), model }
}
