import type { BatchOp } from '@protobase/client'
import { includedFields, type TableProposal } from './table-proposal'

/** The resource of the fields of tables users add, beside the tables' own, as the API names them. */
export const fieldsResource = 'user_table_fields'

const tableRef = 'table'

/**
 * The one batch write that makes the table and all its fields, in the file's order, then sets its title field: the
 * server makes all of it in one transaction, or none of it, so a refused field never leaves a half-made table.
 */
export const createTableOps = (tablesResource: string, proposal: TableProposal): BatchOp[] => {
  const fields = includedFields(proposal).map(
    (field, index): BatchOp => ({
      op: 'create',
      resource: fieldsResource,
      data: {
        table_id: { $ref: tableRef },
        name: field.name,
        label: field.label.trim(),
        type: field.type,
        position: index + 1,
        ...(field.type === 'decimal' && { precision: field.decimal.precision, scale: field.decimal.scale }),
      },
    }),
  )
  const title: BatchOp[] = proposal.titleField ? [{ op: 'update', resource: tablesResource, key: { $ref: tableRef }, etag: '*', data: { title_field: proposal.titleField } }] : []
  return [
    { op: 'create', resource: tablesResource, ref: tableRef, data: { name: proposal.name, singular_label: proposal.singularLabel.trim(), plural_label: proposal.pluralLabel.trim() } },
    ...fields,
    ...title,
  ]
}
