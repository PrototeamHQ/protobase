import type { ResourceModel } from '@protobase/schema'
import { capturedBy, resourceTriggers } from './capture-sql'
import { changesSchema, type EventsOptions } from './events-options'

/**
 * What the change capture of `models` names in the database, as `checkChanges` looks it up in the catalog: the changes
 * schema, which holds `capture()` and the outbox, history and notices tables, and each captured resource's triggers.
 */
export const captureNames = (models: readonly ResourceModel[], options?: EventsOptions) => ({
  schema: changesSchema(options),
  resources: models.filter(capturedBy(models)).map((model) => ({ model, triggers: resourceTriggers(model).map((trigger) => trigger.name) })),
})
