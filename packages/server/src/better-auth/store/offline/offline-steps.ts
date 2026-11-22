import type { ModuleId } from '../../names/modules'
import { migrationsTableSql, statementsSql, stepsSql } from '../migration-sql'
import { refuseModulesOff } from '../modules-off'
import { moduleSteps } from '../steps'
import { legacyVersions } from '../steps/legacy-versions'
import { renderSteps, type Had } from '../steps/render'
import { migrationNames } from '../steps/step'
import type { StoreNames } from '../store-names'
import type { LastSteps } from './store-model'

// The store's steps written from a project's snapshot, without a database: the snapshot says which step of each module
// the project's migrations end at, and every step after it is written.

const refuseNewer = (lastSteps: LastSteps) => {
  for (const [module, last] of Object.entries(lastSteps) as [ModuleId, number][]) {
    const shipped = moduleSteps[module]?.at(-1)?.step
    if (shipped === undefined || last > shipped) throw new Error(`The snapshot has step ${last} of the ${module} module, which this version of Protobase does not ship; upgrade Protobase`)
  }
}

/**
 * The steps of the modules that are on after `lastSteps`, the snapshot's, each version of the store's former chain
 * followed by its row in `auth_migrations`, which the server's check reads; for a store the snapshot has none of
 * (`lastSteps` undefined), that table first. `checks`: the checks of the steps on tables the store has already, which
 * refuse when its rows break what a step assumes. `undefined` when the snapshot has every step.
 */
export const offlineStepsMigration = (names: StoreNames, lastSteps: LastSteps | undefined) => {
  refuseModulesOff(names)
  if (lastSteps) refuseNewer(lastSteps)
  const had: Had = (module, step) => step.step <= (lastSteps?.[module] ?? 0)
  const migration = migrationNames(names)
  const rendered = renderSteps(migration, names.names.modules, had)
  if (rendered.length === 0) return undefined
  const recorded = (version: number) => (Object.entries(moduleSteps) as [ModuleId, (typeof moduleSteps)[ModuleId]][]).every(([module, steps]) => steps.filter((step) => step.version === version).every((step) => had(module, step)))
  const steps = stepsSql(names, rendered, legacyVersions.map(({ version }) => version).filter((version) => !recorded(version)))
  const checks = rendered.filter(({ module, step, on }) => on === undefined && step.check && had(module, moduleSteps[module][0]!)).map(({ step }) => statementsSql([step.check!(migration)]))
  return { sql: lastSteps ? steps : [migrationsTableSql(names), steps].join('\n\n'), checks }
}
