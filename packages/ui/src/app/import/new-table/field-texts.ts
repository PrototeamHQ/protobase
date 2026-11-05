import type { UserTableFieldType, ViewModel } from '@protobase/schema'
import { fieldLabel } from '../mapping'
import { fieldsResource } from './create-table-ops'

/**
 * The texts the fields step shares with the forms tables and fields are made in: the labels and help of the tables'
 * and fields' views, and each type's name in words, such as Whole number, all in the app's language.
 */
export const fieldTexts = (views: Record<string, ViewModel>, tablesResource: string) => {
  const tables = views[tablesResource]
  const fields = views[fieldsResource]
  return {
    table: (name: string) => ({ label: fieldLabel(tables, name), help: tables?.fields[name]?.help }),
    field: (name: string) => ({ label: fieldLabel(fields, name), help: fields?.fields[name]?.help }),
    type: (type: UserTableFieldType) => fields?.fields.type?.valueLabels?.[type] ?? type,
  }
}

export type FieldTexts = ReturnType<typeof fieldTexts>
