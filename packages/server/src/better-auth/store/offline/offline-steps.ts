import type { ModuleId } from '../../names/modules'
import { stepRecordMigration } from '../legacy-record'
import { afterStepsSql, guardedStepsSql, stepRecordSql, statementsSql } from '../migration-sql'
import { moduleSteps } from '../steps'
import { renderSteps, type Had, type RenderedStep } from '../steps/render'
import { migrationNames, type OrganizationsInput } from '../steps/step'
import type { StoreNames } from '../store-names'
import type { LastSteps } from './store-model'

// The store's steps written from a project's snapshot, without a database: the snapshot says which step of each module
// the project's migrations end at, and every step after it is written.

/**
 * The store as a project's snapshot has it: each module's last step, those kept while off included; the modules that
 * are on; and whether it has `auth_steps`, which a store a version before it made lacks.
 */
export type SnapshotStore = { lastSteps: LastSteps; on: readonly ModuleId[]; stepRecord: boolean }

const refuseNewer = (lastSteps: LastSteps) => {
  for (const [module, last] of Object.entries(lastSteps) as [ModuleId, number][]) {
    const shipped = moduleSteps[module]?.at(-1)?.step
    if (shipped === undefined || last > shipped) throw new Error(`The snapshot has step ${last} of the ${module} module, which this version of Protobase does not ship; upgrade Protobase`)
  }
}

/**
 * The parts the store has: those of each module's steps up to its last, and those a step adds to another module's
 * tables while both are on. Those it added to a module that was off since, or before, are written again, and their
 * guard skips them where the database has them.
 */
const snapshotHad =
  ({ lastSteps, on }: SnapshotStore): Had =>
  (module, step, target) =>
    step <= (lastSteps[module] ?? 0) && (target === module || (on.includes(module) && on.includes(target)))

/**
 * The parts of the modules that are on that the snapshot's store lacks, each followed by its row in `auth_steps`, each
 * run only while that table lacks it, so a database that has it already skips it; for a store the snapshot has none of
 * (`store` undefined), that table first, and for one without it, that table, filled from `auth_migrations`. `checks`:
 * the checks of the parts on tables the store has already, which refuse when its rows break what a step assumes;
 * `after`, what the parts leave for the migration's `.after.sql`, when they leave anything. `undefined` when the
 * snapshot's store has every part. `externalUser`: the snapshot records the user table as a relation Protobase did
 * not make, whose statements are left out. `organizations`: the config's default organization and the role of the
 * users there already (`renderSteps`).
 */
export const offlineStepsMigration = (names: StoreNames, store: SnapshotStore | undefined, organizations: OrganizationsInput | undefined, externalUser = false) => {
  if (store) refuseNewer(store.lastSteps)
  const had = store ? snapshotHad(store) : () => false
  const migration = migrationNames(names, externalUser || names.users.keyTable !== undefined)
  const rendered = renderSteps(migration, names.names.modules, had, organizations)
  const record = !store ? [stepRecordSql(names)] : store.stepRecord ? [] : [stepRecordMigration(names)]
  if (rendered.length === 0 && record.length === 0) return
  const steps = rendered.length === 0 ? [] : [guardedStepsSql(names, rendered)]
  // A part's check reads the tables it changes: those of its own module, or of the module it adds to.
  const onTablesThere = ({ module, on = module }: RenderedStep) => had(on, moduleSteps[on][0]!.step, on)
  const checks = rendered.filter((part) => part.check && onTablesThere(part)).map((part) => statementsSql([part.check!]))
  const after = afterStepsSql(rendered)
  return { sql: [...record, ...steps].join('\n\n'), checks, ...(after && { after }) }
}
