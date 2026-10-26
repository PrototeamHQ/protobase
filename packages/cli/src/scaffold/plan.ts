import path from 'node:path'
import { keyColumns } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { camelCase } from '../infer/names'
import { proposeField, type ProposalContext } from '../infer/proposal'
import { addFieldsToDataFile, makeLiveInDataFile, renderDataFile } from './data-file'
import { detectDrift, type Drift } from './drift'
import { findField, type ExistingResource } from './existing-config'
import { ensureExports, type Registration } from './index-file'
import { assignNames } from './resource-names'
import { planResource, type Decision } from './resource-plan'
import { protobaseSchemas, type ProtobaseSchema } from './protobase-tables'
import type { Decide } from './prompt'
import { dependencyOrder } from './table-order'
import { isExcluded, matchesTarget, type Target } from './targets'
import { uiFields } from './ui-fields'
import { addUiSections, renderUiFile, viewName, type UiSection } from './ui-file'

export type FileChange = { path: string; before?: string; after: string }

export type ScaffoldInput = {
  // Tables, and views to name as skipped.
  tables: DbTable[]
  existing: ExistingResource[]
  configDir: string
  target: Target
  excludes: string[]
  decide: Decide
  ui: UiSection[]
  // "schema.table" of the tables whose resources get `.live()`.
  live?: string[]
  // Current file content, or undefined when the file does not exist.
  readText: (file: string) => Promise<string | undefined>
}

export type ScaffoldPlan = {
  changes: FileChange[]
  drift: Drift[]
  warnings: string[]
  // Protobase's own tables, left out unless the target names their schema.
  skipped: ProtobaseSchema[]
  // "schema.table" of the `live` tables whose resource has `.live()` now.
  live: string[]
}

const decideAll = async (table: DbTable, columns: DbTable['columns'], context: ProposalContext, input: ScaffoldInput) => {
  const key = keyColumns(table) ?? []
  const decisions: Decision[] = []
  for (const column of columns) {
    const proposal = proposeField(table, column, context)
    const decided = await input.decide(proposal, { table: tableKey(table), required: key.includes(column.name) })
    decisions.push(decided ? { proposal: decided, ignored: false } : { proposal, ignored: true })
  }
  return decisions
}

const change = (file: string, before: string | undefined, after: string): FileChange[] =>
  before === after ? [] : [{ path: file, ...(before !== undefined && { before }), after }]

export const planScaffold = async (input: ScaffoldInput): Promise<ScaffoldPlan> => {
  const { configDir, existing, ui } = input
  const byTable = new Map(existing.map((resource) => [resource.table, resource]))
  const wanted = (table: DbTable) => matchesTarget(input.target, table) && !isExcluded(input.excludes, table)
  const tables = input.tables.filter((table) => table.kind === 'table')
  const skipped = protobaseSchemas(tables.filter((table) => matchesTarget(input.target, table)), input.target)
  const isProtobase = (table: DbTable) => skipped.some((schema) => schema.tables.includes(table))
  // A view has no key Postgres knows, so a resource over one is written by hand; one already declared is left as it is,
  // and so is one in a schema of Protobase's own, other than public, which may also hold the app's tables.
  const inProtobaseSchema = (view: DbTable) => skipped.some(({ schema }) => schema === view.schema && schema !== 'public')
  const skippedViews = input.tables.filter((table) => table.kind !== 'table' && wanted(table) && !byTable.has(tableKey(table)) && !inProtobaseSchema(table))
  // Protobase's tables take no names, so an app's `session` stays `session` next to the auth store's.
  const names = assignNames(tables.filter((table) => !isProtobase(table)), existing)
  const context = (table: DbTable): ProposalContext => ({
    table,
    resourceNameOf: (schema, name) => names.get(`${schema}.${name}`) ?? name,
  })
  const targets = dependencyOrder(tables.filter((table) => wanted(table) && !isProtobase(table)))

  const changes: FileChange[] = []
  const drift: Drift[] = []
  const warnings = skippedViews.map((view) => `${tableKey(view)}: a ${view.kind}, skipped; scaffold writes resources over tables, declare one over a view by hand`)
  const registrations: Registration[] = []
  const live: string[] = []
  const isLive = (key: string) => input.live?.includes(key) ?? false

  const writeUi = async (dir: string, resource: string, identifier: string, table: DbTable, current: ExistingResource | undefined, decisions: Decision[]) => {
    if (ui.length === 0) return
    const file = path.join(configDir, dir, 'ui.ts')
    const before = await input.readText(file)
    const target = { resource, identifier, tableName: table.name, fields: uiFields(table, current, decisions) }
    changes.push(...change(file, before, before === undefined ? renderUiFile(target, ui) : addUiSections(before, target, ui)))
    if (before === undefined) registrations.push({ from: `./${dir}/ui`, names: [viewName(identifier)] })
  }

  for (const resource of existing) {
    const table = input.tables.find((each) => tableKey(each) === resource.table)
    if (table && isProtobase(table)) warnings.push(`${resource.table}: one of Protobase's own tables, which ${resource.dir}/data.ts declares; remove that resource`)
  }

  for (const table of targets) {
    const key = tableKey(table)
    const current = byTable.get(key)

    if (current) {
      const columns = table.columns.filter((c) => !input.target.column || c.name === input.target.column)
      const pending = columns.filter((column) => !findField(current, column.name))
      const decisions = await decideAll(table, pending, context(table), input)
      const clash = decisions.find((d) => current.fields.some((f) => f.name === d.proposal.name))
      if (clash) throw new Error(`${key}: field "${clash.proposal.name}" already exists, edit the name`)
      const file = path.join(configDir, current.dir, 'data.ts')
      const fielded = addFieldsToDataFile(current.text, decisions)
      changes.push(...change(file, current.text, isLive(key) ? makeLiveInDataFile(fielded) : fielded))
      if (isLive(key)) live.push(key)
      drift.push(...detectDrift(current, table, context(table)))
      await writeUi(current.dir, current.name, current.identifier, table, current, decisions)
      continue
    }

    const name = names.get(key)!
    if (!keyColumns(table)) {
      warnings.push(`${key}: no primary key or unique NOT NULL index, skipped`)
      continue
    }
    const file = path.join(configDir, name, 'data.ts')
    if ((await input.readText(file)) !== undefined) {
      throw new Error(`${file} exists but does not declare a resource for ${key}`)
    }
    const decisions = await decideAll(table, table.columns, context(table), input)
    const plan = { ...planResource(name, table, decisions)!, live: isLive(key) }
    changes.push({ path: file, after: renderDataFile(plan) })
    if (plan.live) live.push(key)
    registrations.push({ from: `./${name}/data`, names: [camelCase(name)] })
    await writeUi(name, name, camelCase(name), table, undefined, decisions)
  }

  const indexFile = path.join(configDir, 'index.ts')
  const indexBefore = await input.readText(indexFile)
  const missingIndex = indexBefore === undefined ? await registerExisting(input, registrations) : []
  const exports = [...missingIndex, ...registrations]
  if (exports.length > 0 || indexBefore === undefined) {
    changes.push(...change(indexFile, indexBefore, ensureExports(indexBefore ?? '', exports)))
  }
  return { changes, drift, warnings, skipped, live }
}

// With no config/index.ts yet, every resource already on disk is registered too.
const registerExisting = async (input: ScaffoldInput, planned: Registration[]) => {
  const known = new Set(planned.map((r) => r.from))
  const registrations: Registration[] = []
  for (const resource of input.existing) {
    const data = `./${resource.dir}/data`
    if (!known.has(data)) registrations.push({ from: data, names: [resource.identifier] })
    const ui = `./${resource.dir}/ui`
    const hasUi = (await input.readText(path.join(input.configDir, resource.dir, 'ui.ts'))) !== undefined
    if (hasUi && !known.has(ui)) registrations.push({ from: ui, names: [viewName(resource.identifier)] })
  }
  return registrations
}
