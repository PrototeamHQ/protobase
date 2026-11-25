import type { ResourceReplaceable, SchemaModule } from '../schema-modules/schema-module'
import { captureFunctionSql, dropCaptureSql, resourceCaptureSql, type ResourceCapture } from './capture-sql'
import { captureVersion, readCapture } from './read-capture'
import { outboxStep } from './steps/001-outbox'

/**
 * The triggers that capture one resource's changes. Kept on a resource that no longer needs them while another still
 * does, so the code still running while the migration deploys, or the version before once rolled back, still captures
 * it, as the dispatch job still drains the outbox; once none does, they go.
 */
const triggers: ResourceReplaceable = {
  name: 'triggers',
  title: 'The triggers that capture the changes',
  version: 1,
  compatibleFrom: 1,
  sql: (names, input) => resourceCaptureSql(names.schema!, input as ResourceCapture),
  drop: (_names, table) => dropCaptureSql(table),
  keptWhileOthers: true,
}

/**
 * The change capture the resources' events, history, live updates and derived values need, in the schema `events`
 * names (`names.schema`): the outbox, `capture()`, and each captured resource's triggers. Its tables are never dropped.
 */
export const changesModule: SchemaModule = {
  label: 'the change capture',
  title: "The change capture the resources' events and history need",
  steps: [{ step: 1, name: 'outbox', title: 'The outbox of captured changes', additive: true, sql: (names) => outboxStep(names.schema!) }],
  // Not marked compatible with an earlier version: the code of one before it is not known to run on it.
  replaceables: [{ name: 'capture', title: 'The function the triggers call, capture()', version: captureVersion, compatibleFrom: captureVersion, sql: (names) => `${captureFunctionSql(names.schema!)};` }],
  resourceReplaceables: [triggers],
  read: readCapture(triggers),
}
