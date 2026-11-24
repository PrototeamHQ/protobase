import type { ModuleId } from '../../names/modules'
import { allModules } from '../../names/modules-on'
import { resolveNames } from '../../names/resolve-names'
import { moduleSteps } from '../steps'
import { refuseUnshipped, type AppliedStep } from '../step-record'
import type { StoreNames } from '../store-names'
import { keptModule, type KeptModule, type LastSteps } from './store-model'

// What `protobase migration baseline` reads of a store, to start a project's snapshot from it as it is: the parts of
// steps it recorded, in `auth_steps` or by version in `auth_migrations`, and its relations in the store's schema, read once.

/** A relation in the store's schema: its `pg_class.relkind` and its columns. */
export type LiveRelation = { kind: string; columns: string[] }

/** The store as the database has it: the parts of steps it recorded, and every relation of its schema by name. */
export type LiveStore = { applied: AppliedStep[]; relations: Record<string, LiveRelation> }

/**
 * What the store is: each module's last step, the modules off that have tables, whether organizations were ever on,
 * the relations Protobase did not make, and whether it has `auth_steps`.
 */
export type BaselineStore = { lastSteps: LastSteps; kept: KeptModule[]; organizationsEverOn: boolean; external: string[]; stepRecord: boolean }

// An ordinary or partitioned table: anything else, such as a view, is a relation another system or the app made.
const tableKinds = ['r', 'p']

// A relation of the schema by name, never one of an object's inherited keys, such as a table named `constructor`.
const relationOf = (live: LiveStore, name: string) => (Object.hasOwn(live.relations, name) ? live.relations[name] : undefined)

/**
 * Each module's last step whose own part, and that of every step before it in its chain, the store recorded. Refuses a
 * recorded step this version does not ship, which the prefix would otherwise leave out unseen.
 */
export const recordedSteps = (applied: readonly AppliedStep[]): LastSteps => {
  refuseUnshipped(applied)
  const steps: LastSteps = {}
  for (const module of allModules) {
    const had = moduleSteps[module].findIndex((step) => !applied.some((part) => part.module === module && part.step === step.step && part.target === module))
    const count = had === -1 ? moduleSteps[module].length : had
    if (count > 0) steps[module] = moduleSteps[module][count - 1]!.step
  }
  return steps
}

/**
 * The store at `live` under the config's `names`: each module that is on at the step the record holds, every module
 * that is off but has a table as kept at the step the record holds, organizations as ever on when a table whose rows belong to an organization has
 * the column that names it, and the user table as external when the config reads it through a view over another
 * system's (`users.keyTable`). Refuses a user table the database has as anything but a table without `users.keyTable`,
 * since the steps' foreign keys would point at it, and a table a recorded step made that the schema lacks under the
 * config's name, such as one renamed since, naming each.
 */
export const baselineStore = (names: StoreNames, live: LiveStore): BaselineStore => {
  const recorded = recordedSteps(live.applied)
  const on = names.names.modules
  const every = resolveNames({ ...names.names.input, modules: allModules })
  const has = (internal: string) => relationOf(live, every.tables[internal]!.name) !== undefined
  const user = names.names.table('user')
  const externalUser = names.users.keyTable !== undefined
  const userRelation = relationOf(live, user.name)
  if (!externalUser && userRelation && !tableKinds.includes(userRelation.kind)) {
    throw new Error(`The auth store's ${user.name} is a view or another relation that is not a table: name the table that holds the user ids in users.keyTable, which the steps' foreign keys point at, and run the baseline again`)
  }

  const lastSteps = Object.fromEntries(on.filter((module) => recorded[module] !== undefined).map((module) => [module, recorded[module]!])) as LastSteps
  const made = (Object.entries(lastSteps) as [ModuleId, number][]).flatMap(([module, last]) => moduleSteps[module].filter((step) => step.step <= last).flatMap((step) => step.tables))
  const missing = [...(lastSteps.auth !== undefined && !externalUser ? ['user'] : []), ...made].filter((internal) => !has(internal))
  if (missing.length > 0) {
    const listed = missing.map((internal) => every.tables[internal]!.name).join(', ')
    throw new Error(`The auth store's schema lacks ${listed}, which the steps the store recorded made: name each as the store has it in auth.tables, or apply the project's migrations first`)
  }

  const kept = allModules
    .filter((module) => !on.includes(module) && Object.values(every.tables).some((table) => table.module === module && has(table.internal)))
    .map((module) => keptModule(names, module, recorded[module] ?? 0))
  const organizationsEverOn = Object.values(every.tables).some((table) => {
    const column = (table.columns as Record<string, { name: string } | undefined>).organization_id
    return table.scope === 'organization' && column !== undefined && (relationOf(live, table.name)?.columns.includes(column.name) ?? false)
  })
  const prefix = names.schema === undefined ? '' : `${names.schema}.`
  return { lastSteps, kept, organizationsEverOn, external: externalUser ? [`${prefix}${user.name}`] : [], stepRecord: has('auth_steps') }
}
