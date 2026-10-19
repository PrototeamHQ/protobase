import type { ResourceModel } from '@protobase/schema'
import { historyTableSql } from '../history/history-sql'
import { noticesTableSql } from '../live/notices-sql'
import { captureBody, captureFunctionSql, createTriggerSql, dropTriggerSql, isCaptured, outboxSql, quoteIdent, resourceTriggers, tableSql, type TriggerSpec } from './capture-sql'

/** A trigger the database has: on a table it names by its oid, calling a function it names by its oid. */
export type FoundTrigger = { table: string; tableSql: string; name: string; function: string; type: number; args: string[] }

/**
 * What the database has of the capture: the outbox, the history and notices tables, `capture()`, the triggers involved
 * and each resource's table.
 */
export type CaptureState = {
  outbox: boolean
  history: boolean
  notices: boolean
  capture?: { oid: string; source: string; definer: boolean }
  /** Triggers calling `capture()`, and every trigger on a resource's table. */
  triggers: FoundTrigger[]
  /** Each resource's table oid; `null` when the table does not exist. */
  tables: Record<string, string | null>
}

/**
 * What brings the database to what the config needs: the schema's setup, the history and notices tables, triggers to
 * (re)create, and triggers to drop.
 */
export type CapturePlan = {
  setup: boolean
  history: boolean
  notices: boolean
  create: Array<{ model: ResourceModel; trigger: TriggerSpec }>
  drop: Array<{ name: string; tableSql: string }>
}

const sameTrigger = (found: FoundTrigger, wanted: TriggerSpec) =>
  found.type === wanted.type && found.args.length === wanted.args.length && found.args.every((arg, index) => arg === wanted.args[index])

const tableOf = (state: CaptureState, model: ResourceModel) => {
  const table = state.tables[model.name]
  if (!table) throw new Error(`The table ${tableSql(model)} of resource "${model.name}" does not exist`)
  return table
}

/**
 * Compares the database with the resources that declare events, history or live updates. Fails on what it cannot change safely: a
 * missing table, two captured resources on one table, or a trigger of the same name that calls another function.
 */
export const capturePlan = (schema: string, models: readonly ResourceModel[], state: CaptureState): CapturePlan => {
  const captured = models.filter(isCaptured)
  const capture = state.capture
  const current = capture !== undefined && capture.definer && capture.source === captureBody(schema)
  const wanted = captured.flatMap((model) => resourceTriggers(model).map((trigger) => ({ model, trigger, table: tableOf(state, model) })))
  const tables = new Map<string, string>()
  for (const { model, table } of wanted) {
    const other = tables.get(table)
    if (other && other !== model.name) throw new Error(`Not implemented: resources "${other}" and "${model.name}" both have events or history on table ${tableSql(model)}; declare them on one`)
    tables.set(table, model.name)
  }
  const create = wanted.filter(({ model, trigger, table }) => {
    const found = state.triggers.find((candidate) => candidate.table === table && candidate.name === trigger.name)
    if (found && found.function !== capture?.oid) throw new Error(`Table ${tableSql(model)} has a trigger "${trigger.name}" of its own; rename it, since events and history need that name`)
    return !found || !sameTrigger(found, trigger)
  })
  const drop = state.triggers
    .filter((found) => found.function === capture?.oid)
    .filter((found) => !wanted.some(({ trigger, table }) => table === found.table && trigger.name === found.name))
  return {
    setup: captured.length > 0 && (!state.outbox || !current),
    history: models.some((model) => model.history) && !state.history,
    notices: models.some((model) => model.live) && !state.notices,
    create: create.map(({ model, trigger }) => ({ model, trigger })),
    drop: drop.map(({ name, tableSql }) => ({ name, tableSql })),
  }
}

/** The plan as SQL statements, each made to apply over what exists already; `undefined` when there is nothing to do. */
export const planSql = (schema: string, plan: CapturePlan) => {
  const statements = [
    ...(plan.setup ? [`create schema if not exists ${quoteIdent(schema)}`, outboxSql(schema), captureFunctionSql(schema)] : []),
    ...(plan.history ? [`create schema if not exists ${quoteIdent(schema)}`, historyTableSql(schema)] : []),
    ...(plan.notices ? [`create schema if not exists ${quoteIdent(schema)}`, noticesTableSql(schema)] : []),
    ...plan.drop.map(({ name, tableSql }) => dropTriggerSql(name, tableSql)),
    ...plan.create.flatMap(({ model, trigger }) => [dropTriggerSql(trigger.name, tableSql(model)), createTriggerSql(schema, trigger, tableSql(model))]),
  ]
  return statements.length === 0 ? undefined : `${statements.join(';\n\n')};`
}

/** The resources whose changes would not be captured or kept as the config declares: what a server refuses to start with. */
export const uncaptured = (plan: CapturePlan, models: readonly ResourceModel[]) => [
  ...new Set([
    ...(plan.setup ? models.filter(isCaptured) : plan.create.map(({ model }) => model)),
    ...(plan.history ? models.filter((model) => model.history) : []),
    ...(plan.notices ? models.filter((model) => model.live) : []),
  ].map((model) => model.name)),
]
