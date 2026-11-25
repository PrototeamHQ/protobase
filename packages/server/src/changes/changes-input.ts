import type { ResourceModel } from '@protobase/schema'
import { checkLiveReads } from '../check-live-reads'
import type { ModuleInput } from '../schema-modules/schema-module'
import { capturedBy, resourceCapture, tableSql } from './capture-sql'
import { changesSchema, type EventsOptions } from './events-options'

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
    const other = tables.get(tableSql(model))
    if (other) throw new Error(`Not implemented: resources "${other}" and "${model.name}" both have events or history on table ${tableSql(model)}; declare them on one`)
    tables.set(tableSql(model), model.name)
  }
  // A table a captured resource has takes that resource's triggers alone.
  const kept = models.filter((model) => !captured(model) && !tables.has(tableSql(model)))
  const triggers = Object.fromEntries([...models.filter(captured), ...kept].map((model) => [model.name, { table: tableOf(model), input: resourceCapture(model), ...(!captured(model) && { kept: true }) }]))
  return { names: { schema: changesSchema(events) }, resources: { triggers } }
}
