import type { ResourceModel } from '@protobase/schema'
import { checkLiveReads } from '../check-live-reads'
import type { ModuleInput } from '../schema-modules/schema-module'
import { capturedBy, quoteIdent, resourceCapture } from './capture-sql'
import { changesSchema, type EventsOptions } from './events-options'

// A table as one identity, to tell when two resources name the same one: an unqualified name is taken to be in
// `public`, the schema Postgres's default search path finds it in. Without a database the path is not known, so a role
// whose search path finds it elsewhere is not followed; the trigger SQL itself keeps the name as the resource gives it.
const tableKey = ({ table }: ResourceModel) => `${quoteIdent(table.schema ?? 'public')}.${quoteIdent(table.name)}`

const tableOf = ({ table }: ResourceModel) => ({ ...(table.schema !== undefined && { schema: table.schema }), name: table.name })

/**
 * What the change capture module takes from the app: the changes schema `events` names, and the triggers of each of
 * `models`, kept only for one whose changes are not captured (`capturedBy`), so its triggers follow its fields while
 * older code may still capture it. Refuses two captured resources on one table, and live reads `checkLiveReads` refuses.
 */
export const changesInput = (models: readonly ResourceModel[], events?: EventsOptions): ModuleInput => {
  checkLiveReads(models)
  const captured = capturedBy(models)
  const tables = new Map<string, string>()
  for (const model of models.filter(captured)) {
    const other = tables.get(tableKey(model))
    if (other) throw new Error(`Not implemented: resources "${other}" and "${model.name}" both have events or history on table ${tableKey(model)}; declare them on one`)
    tables.set(tableKey(model), model.name)
  }
  // A table a captured resource has takes that resource's triggers alone.
  const kept = models.filter((model) => !captured(model) && !tables.has(tableKey(model)))
  const triggers = Object.fromEntries([...models.filter(captured), ...kept].map((model) => [model.name, { table: tableOf(model), input: resourceCapture(model), ...(!captured(model) && { kept: true }) }]))
  return { names: { schema: changesSchema(events) }, resources: { triggers } }
}
