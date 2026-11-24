import type { ModuleId } from '../../names/modules'
import { allModules } from '../../names/modules-on'
import { resolveNames } from '../../names/resolve-names'
import { moduleSteps } from '../steps'
import { legacyVersions } from '../steps/legacy-versions'
import type { StoreNames } from '../store-names'
import type { LastSteps } from './store-model'

// What `protobase migration baseline` reads of a store made by the former single chain, to start a project's snapshot
// from it as it is: its record of versions in `auth_migrations` and its relations in the store's schema, read once.

/** A relation in the store's schema: its `pg_class.relkind` and its columns. */
export type LiveRelation = { kind: string; columns: string[] }

/** The store as the database has it: the versions `auth_migrations` records, and every relation of its schema by name. */
export type LiveStore = { versions: number[]; relations: Record<string, LiveRelation> }

/** What the store is: each module's last step, the modules off that have tables, whether organizations were ever on, and the relations Protobase did not make. */
export type BaselineStore = { lastSteps: LastSteps; kept: ModuleId[]; organizationsEverOn: boolean; external: string[] }

// An ordinary or partitioned table: anything else, such as a view, is a relation another system or the app made.
const tableKinds = ['r', 'p']

// A relation of the schema by name, never one of an object's inherited keys, such as a table named `constructor`.
const relationOf = (live: LiveStore, name: string) => (Object.hasOwn(live.relations, name) ? live.relations[name] : undefined)

/** Each module's last step whose version, and every one before it in its chain, the store records. */
export const recordedSteps = (versions: readonly number[]): LastSteps => {
  const shipped = legacyVersions.at(-1)!.version
  const newer = versions.filter((version) => version > shipped)
  if (newer.length > 0) throw new Error(`The auth store records version ${newer.join(', ')} in auth_migrations, which this version of Protobase does not ship; upgrade Protobase`)
  const steps: LastSteps = {}
  for (const module of allModules) {
    const had = moduleSteps[module].findIndex((step) => !versions.includes(step.version))
    const count = had === -1 ? moduleSteps[module].length : had
    if (count > 0) steps[module] = moduleSteps[module][count - 1]!.step
  }
  return steps
}

/**
 * The store at `live` under the config's `names`: each module that is on at the step the record holds, every module
 * that is off but has a table as kept, organizations as ever on when a table whose rows belong to an organization has
 * the column that names it, and the user table as external when the config reads it through a view over another
 * system's (`users.keyTable`). Refuses a user table the database has as anything but a table without `users.keyTable`,
 * since the steps' foreign keys would point at it, and a table a recorded step made that the schema lacks under the
 * config's name, such as one renamed since, naming each.
 */
export const baselineStore = (names: StoreNames, live: LiveStore): BaselineStore => {
  const recorded = recordedSteps(live.versions)
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
    throw new Error(`The auth store's schema lacks ${listed}, which the versions in auth_migrations made: name each as the store has it in auth.tables, or apply the project's migrations first`)
  }

  const kept = allModules.filter((module) => !on.includes(module) && Object.values(every.tables).some((table) => table.module === module && has(table.internal)))
  const organizationsEverOn = Object.values(every.tables).some((table) => {
    const column = (table.columns as Record<string, { name: string } | undefined>).organization_id
    return table.scope === 'organization' && column !== undefined && (relationOf(live, table.name)?.columns.includes(column.name) ?? false)
  })
  const prefix = names.schema === undefined ? '' : `${names.schema}.`
  return { lastSteps, kept, organizationsEverOn, external: externalUser ? [`${prefix}${user.name}`] : [] }
}
