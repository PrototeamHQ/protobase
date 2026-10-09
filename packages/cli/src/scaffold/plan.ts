import path from 'node:path'
import { keyColumns } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { proposeField, type ProposalContext } from '../infer/proposal'
import { addFieldsToDataFile, renderDataFile } from './data-file'
import { detectDrift, type Drift } from './drift'
import { findField, type ExistingResource } from './existing-config'
import { ensureExports, type Registration } from './index-file'
import { assignNames } from './resource-names'
import { planResource, type Decision } from './resource-plan'
import type { Decide } from './prompt'
import { isExcluded, matchesTarget, type Target } from './targets'
import { uiFields } from './ui-fields'
import { addUiSections, renderUiFile, viewName, type UiSection } from './ui-file'

export type FileChange = { path: string; before?: string; after: string }

export type ScaffoldInput = {
  tables: DbTable[]
  existing: ExistingResource[]
  configDir: string
  target: Target
  excludes: string[]
  decide: Decide
  ui: UiSection[]
  // Current file content, or undefined when the file does not exist.
  readText: (file: string) => Promise<string | undefined>
}

export type ScaffoldPlan = {
  changes: FileChange[]
  drift: Drift[]
  warnings: string[]
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
  const names = assignNames(input.tables, existing)
  const byTable = new Map(existing.map((resource) => [resource.table, resource]))
  const context = (table: DbTable): ProposalContext => ({
    table,
    resourceNameOf: (schema, name) => names.get(`${schema}.${name}`) ?? name,
  })
  const targets = input.tables
    .filter((table) => matchesTarget(input.target, table) && !isExcluded(input.excludes, table))
    .sort((a, b) => tableKey(a).localeCompare(tableKey(b)))

  const changes: FileChange[] = []
  const drift: Drift[] = []
  const warnings: string[] = []
  const registrations: Registration[] = []

  const writeUi = async (dir: string, resource: string, table: DbTable, current: ExistingResource | undefined, decisions: Decision[]) => {
    if (ui.length === 0) return
    const file = path.join(configDir, dir, 'ui.ts')
    const before = await input.readText(file)
    const target = { resource, tableName: table.name, fields: uiFields(table, current, decisions) }
    changes.push(...change(file, before, before === undefined ? renderUiFile(target, ui) : addUiSections(before, target, ui)))
    if (before === undefined) registrations.push({ from: `./${dir}/ui`, names: [viewName(resource)] })
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
      changes.push(...change(file, current.text, addFieldsToDataFile(current.text, decisions)))
      drift.push(...detectDrift(current, table, context(table)))
      await writeUi(current.dir, current.name, table, current, decisions)
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
    const plan = planResource(name, table, decisions)!
    changes.push({ path: file, after: renderDataFile(plan) })
    registrations.push({ from: `./${name}/data`, names: [name] })
    await writeUi(name, name, table, undefined, decisions)
  }

  const indexFile = path.join(configDir, 'index.ts')
  const indexBefore = await input.readText(indexFile)
  const missingIndex = indexBefore === undefined ? await registerExisting(input, registrations) : []
  const wanted = [...missingIndex, ...registrations]
  if (wanted.length > 0 || indexBefore === undefined) {
    changes.push(...change(indexFile, indexBefore, ensureExports(indexBefore ?? '', wanted)))
  }
  return { changes, drift, warnings }
}

// With no config/index.ts yet, every resource already on disk is registered too.
const registerExisting = async (input: ScaffoldInput, planned: Registration[]) => {
  const known = new Set(planned.map((r) => r.from))
  const registrations: Registration[] = []
  for (const resource of input.existing) {
    const data = `./${resource.dir}/data`
    if (!known.has(data)) registrations.push({ from: data, names: [resource.name] })
    const ui = `./${resource.dir}/ui`
    const hasUi = (await input.readText(path.join(input.configDir, resource.dir, 'ui.ts'))) !== undefined
    if (hasUi && !known.has(ui)) registrations.push({ from: ui, names: [viewName(resource.name)] })
  }
  return registrations
}
