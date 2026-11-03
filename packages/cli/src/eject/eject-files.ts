import { maxTextLength, type CheckedDefinition } from '@protobase/server/config-exports'
import type { ResourceModel } from '@protobase/schema'
import type { DbTable } from '../db/model'
import { camelCase } from '../infer/names'
import { proposeField } from '../infer/proposal'
import { renderDataFile } from '../scaffold/data-file'
import { planResource, type Decision } from '../scaffold/resource-plan'
import { uiFields } from '../scaffold/ui-fields'
import { renderUiFile } from '../scaffold/ui-file'

/** A table users added, as eject reads it: its table in the catalogue, its definition and the resource the server serves from it. */
export type EjectedTable = { table: DbTable; definition: CheckedDefinition; model: ResourceModel }

// Scaffold's field for each column, named as the definition names it, filtered, sorted and capped as the server serves
// it; a column the definition has no field for is left out, as the server leaves it out.
const decisionOf = ({ table, definition, model }: EjectedTable, column: DbTable['columns'][number]): Decision => {
  const proposal = { ...proposeField(table, column, { table, resourceNameOf: (_, name) => name }), name: column.name }
  const served = model.fields[column.name]
  if (!served) return { proposal, ignored: true }
  const capped = definition.fields.some((field) => field.name === column.name && field.type === 'text')
  return { proposal: { ...proposal, filterable: served.filterable, sortable: served.sortable, ...(capped && { max: maxTextLength }) }, ignored: false }
}

/**
 * The config/<name>/data.ts and ui.ts that serve a table users added as the server serves it from its definition, written
 * with scaffold's renderers: its resource of the same name over the same table, its fields, key, search and admins-only
 * access, then its view with the definition's names, title and field labels, and scaffold's list.
 */
export const ejectFiles = (ejected: EjectedTable) => {
  const { table, definition, model } = ejected
  const decisions = table.columns.map((column) => decisionOf(ejected, column))
  const plan = planResource(definition.name, table, decisions)
  if (!plan) throw new Error(`${definition.name}: its table has no primary key`)
  const data = renderDataFile({ ...plan, softDelete: undefined, tenant: undefined, search: model.search?.[0], adminsOnly: true })
  const labels = {
    singular: definition.singular_label,
    plural: definition.plural_label,
    ...(definition.title_field !== null && { title: definition.title_field }),
    fields: definition.fields.map((field) => ({ name: field.name, label: field.label, multiline: field.type === 'long_text' })),
  }
  const target = { resource: definition.name, identifier: camelCase(definition.name), tableName: table.name, fields: uiFields(table, undefined, decisions), labels }
  return { data, ui: renderUiFile(target, ['names', 'list']) }
}
