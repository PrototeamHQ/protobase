import type { ResourceModel } from '@protobase/schema'
import { capturedBy, resourceTriggers } from './capture-sql'
import { migrationCommand } from './capture-schema'
import { changesSchema, type EventsOptions } from './events-options'

/**
 * What the change capture of `models` names in the database, as the change capture module writes it: the changes
 * schema, which holds `capture()` and the outbox, history and notices tables, and each captured resource's triggers.
 */
export const captureNames = (models: readonly ResourceModel[], options?: EventsOptions) => ({
  schema: changesSchema(options),
  resources: models.filter(capturedBy(models)).map((model) => ({ model, triggers: resourceTriggers(model).map((trigger) => trigger.name) })),
})

/** What `protobase doctor` reports while the changes of the `missing` resources are not captured. */
export const uncapturedMessage = (missing: readonly string[]) =>
  `The changes of ${missing.join(', ')} are not captured as their events, history or live updates need: their triggers, the history or notices table or the changes schema are missing or out of date. Write the change as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`
