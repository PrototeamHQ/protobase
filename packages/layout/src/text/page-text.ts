import type { LayoutNode } from '../node'
import { pageParamValues } from '../page-params'
import { planReadId, type PlanRead, type ReadPlan } from '../read-plan'
import { plannedRows, runReadPlan, type PlanResult } from '../run-plan'
import { selectBlocks } from '../select-blocks'
import { columnName, type TableColumn } from '../table-columns'
import { renderText } from './render-text'
import type { TableText } from './table-text'
import type { TextFieldLabels, TextOptions } from './text-form'

export type PageTextOptions = Omit<TextOptions, 'records' | 'tables'> & {
  /** Makes one read of the plan as the reader, such as a list or an `:aggregate` of the API. */
  read: (read: PlanRead) => Promise<PlanResult>
  /** Per resource, its fields' labels and value labels, which its tables' headers and cells read; a field without one reads under its name. */
  labels?: Record<string, Record<string, TextFieldLabels>>
}

type Outcomes = Awaited<ReturnType<typeof runReadPlan>>

// The rows a read gave where its block draws: none when it failed, so the block reads as it does without them
const rowsAt = (outcomes: Outcomes, reads: Map<string, PlanRead>, id: string, record: Record<string, unknown> | undefined, params: Record<string, string>) => {
  const read = reads.get(id)
  const outcome = outcomes.get(id)
  // A read inside the records of another has nothing to give outside one
  if (!read || outcome?.status !== 'fulfilled' || (read.split && !record)) return
  return plannedRows(read, outcome.value.rows, { stack: record ? [{ record }] : [], params })
}

const tableOf = (node: LayoutNode, rows: Record<string, unknown>[], labels: PageTextOptions['labels']): TableText => {
  const resource = String(node.props.resource)
  const names = (node.props.columns as TableColumn[] | undefined)?.map(columnName) ?? Object.keys(rows[0] ?? {})
  const columns = names.map((name) => ({ name, label: labels?.[resource]?.[name]?.label ?? name, ...(labels?.[resource]?.[name]?.valueLabels && { valueLabels: labels[resource][name].valueLabels }) }))
  return { columns, rows }
}

/**
 * A page's text form with the records it shows: every read of `plan`, the page's read plan, starts at once through
 * `read`, and once they are back each data block reads its own read's records, a block inside the records of another
 * those of its record. A read that fails leaves its block as it reads without records.
 */
export const pageText = async (tree: LayoutNode, plan: ReadPlan, { read, labels, ...options }: PageTextOptions): Promise<string> => {
  const params = pageParamValues(tree, options.params)
  const outcomes = await runReadPlan(plan, read, { params })
  const reads = new Map(plan.reads.map((planned) => [planReadId(planned), planned]))
  // The row a `select` chose is a read of its own; the block's own read gives its other records
  const records: TextOptions['records'] = (node, record, at) =>
    rowsAt(outcomes, reads, selectBlocks.has(node.type) && typeof node.props.select === 'string' ? planReadId({ block: at, part: 'chosen' }) : at, record, params)
  const tables: TextOptions['tables'] = (node, at) => {
    const rows = rowsAt(outcomes, reads, at, undefined, params)
    return rows && tableOf(node, rows, labels)
  }
  return renderText(tree, { ...options, params, records, tables })
}
