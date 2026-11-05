import { fieldNamesOf, tableNameOf, type ColumnType, type UserTableFieldType } from '@protobase/schema'
import { columnName } from '../sheet-cell'
import type { ReadColumns } from './read-columns'

/** A column of the file as the field it becomes, or left out; `inferred` is what its cells say, `decimal` the decimal that holds them. */
export type ProposedField = { column: number; include: boolean; name: string; label: string; type: UserTableFieldType; inferred: ColumnType; decimal: ColumnType & { precision: number; scale: number } }

/** The table a file becomes: its name, labels and title field, and a field per column. */
export type TableProposal = { name: string; pluralLabel: string; singularLabel: string; titleField?: string; fields: ProposedField[] }

/**
 * The table a file proposes: named after the file, and not after a resource in `taken`, with the file's name as its
 * plural label and no singular label, which the user gives; each column a field named and labelled from its header,
 * typed from its cells; and the first text field as its title.
 */
export const proposeTable = (fileName: string, read: ReadColumns, taken: Iterable<string>, maxTableBytes: number): TableProposal => {
  const names = fieldNamesOf(read.headers)
  const fields = read.headers.map((_, column) => ({
    column,
    include: true,
    name: names[column]!,
    label: columnName(read.headers, column).trim(),
    type: read.types[column]!.type,
    inferred: read.types[column]!,
    decimal: read.decimals[column]!,
  }))
  return {
    name: tableNameOf(fileName, taken, maxTableBytes) ?? '',
    pluralLabel: fileName.replace(/\.[^.]+$/, '').trim(),
    singularLabel: '',
    titleField: fields.find((field) => field.type === 'text')?.name,
    fields,
  }
}

/** The fields the table gets, in the file's order. */
export const includedFields = (proposal: TableProposal) => proposal.fields.filter((field) => field.include)

/** The proposal with one column's field changed, and the title moved off a field that is no longer text or included. */
export const changeField = (proposal: TableProposal, column: number, change: Partial<Pick<ProposedField, 'include' | 'name' | 'label' | 'type'>>): TableProposal => {
  const before = proposal.fields.find((field) => field.column === column)
  const fields = proposal.fields.map((field) => (field.column === column ? { ...field, ...change } : field))
  const changed = fields.find((field) => field.column === column)!
  const wasTitle = before?.name === proposal.titleField
  const staysTitle = changed.include && changed.type === 'text'
  if (!wasTitle) return { ...proposal, fields }
  return { ...proposal, fields, titleField: staysTitle ? changed.name : undefined }
}
