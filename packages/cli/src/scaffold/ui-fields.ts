import { keyColumns } from '../db/keys'
import type { DbTable } from '../db/model'
import { findField, type ExistingResource } from './existing-config'
import { isTenantColumn } from '../infer/tenant'
import { isSoftDeleteColumn, type Decision } from './resource-plan'
import type { UiField } from './ui-file'

// The fields a view can reference, in column order, merging declared fields with new decisions.
export const uiFields = (table: DbTable, existing: ExistingResource | undefined, decisions: Decision[]) => {
  const key = keyColumns(table) ?? []
  return table.columns.flatMap((column): UiField[] => {
    const declared = existing && findField(existing, column.name)
    const decided = decisions.find((d) => d.proposal.column === column.name)
    const resolved = declared
      ? { name: declared.name, type: declared.type ?? 'text', ignored: declared.ignored }
      : decided && { name: decided.proposal.name, type: decided.proposal.type, ignored: decided.ignored }
    if (!resolved || resolved.ignored) return []
    const role = key.includes(column.name)
      ? 'key'
      : isTenantColumn(column.name)
        ? 'tenant'
        : isSoftDeleteColumn(table, column.name)
          ? 'softDelete'
          : 'plain'
    return [{ name: resolved.name, type: resolved.type, role }]
  })
}
