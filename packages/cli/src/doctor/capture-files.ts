import type { ResourceModel } from '@protobase/schema'
import type { EventsOptions } from '@protobase/server'
import { captureNames, uncapturedMessage } from '@protobase/server/internal'
import type { Issue } from './check'
import { createsFunction, createsTable, createsTrigger } from './migration-sql'

/**
 * The change capture the server needs, judged from the project's migrations (`readMigrationSql`) by the
 * names the change capture module writes: `capture()` and the outbox, the history table for history, the notices
 * table for live updates, and each resource's triggers on its table. Only resources whose table a migration creates are
 * judged, each failing with doctor's message; `unjudged` are the others, whose table is the database's to show.
 * A trigger a later migration drops, or one created in dynamic SQL, is judged only with a database.
 */
export const captureFileIssues = (models: readonly ResourceModel[], events: EventsOptions | undefined, sql: string) => {
  const { schema, resources } = captureNames(models, events)
  const judged = resources.filter(({ model }) => createsTable(sql, model.table))
  const setup = createsFunction(sql, schema, 'capture') && createsTable(sql, { schema, name: 'outbox' })
  const history = createsTable(sql, { schema, name: 'history' })
  const notices = createsTable(sql, { schema, name: 'notices' })
  const captured = ({ model, triggers }: (typeof resources)[number]) =>
    setup && triggers.every((trigger) => createsTrigger(sql, trigger, model.table)) && (!model.history || history) && (!model.live || notices)
  const issues: Issue[] = judged.filter((resource) => !captured(resource)).map(({ model }) => ({ severity: 'error', resource: model.name, message: uncapturedMessage([model.name]) }))
  const unjudged = resources.filter((resource) => !judged.includes(resource)).map(({ model }) => model.name)
  return { issues, unjudged }
}
