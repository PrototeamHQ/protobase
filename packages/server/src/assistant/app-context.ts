import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'

const fieldLine = (field: FieldModel, view: ViewModel | undefined) => {
  const label = view?.fields[field.name]?.label
  const traits = [
    field.type === 'enum' && field.enumValues ? `one of ${field.enumValues.join(', ')}` : field.type,
    field.relation && `links to ${field.relation.resource}`,
    field.nullable && 'optional',
    field.readOnly && 'read-only',
  ].filter(Boolean)
  return `  - ${field.name}${field.column === field.name ? '' : ` (column ${field.column})`}${label ? `, "${label}"` : ''}: ${traits.join(', ')}`
}

const tableName = (model: ResourceModel) => (model.table.schema ? `${model.table.schema}.${model.table.name}` : model.table.name)

const resourceBlock = (model: ResourceModel, view: ViewModel | undefined) => {
  const names = view?.names ? `, "${view.names.plural}"` : ''
  const help = view?.help ? `\n  ${view.help}` : ''
  return `- ${model.name} (table ${tableName(model)}${names})${help}\n${Object.values(model.fields).map((field) => fieldLine(field, view)).join('\n')}`
}

/**
 * The built-in assistant's system prompt: what the app is, from what the caller may see of it in `/meta` (their
 * restricted models and views), and how to use the query tools.
 */
export const appContext = (resources: ResourceModel[], views: ViewModel[]) =>
  [
    'You are the assistant inside an admin app built with Protobase, on a PostgreSQL database. You answer questions about the app and its data.',
    'To look at the data, call run_read_only_query with one SELECT; the user sees its rows as a table, so do not repeat them all. To change data, and only when the user asks for a change, call propose_write_query: the user has to approve the statement before it runs. Never claim a change ran unless the tool returned its rows.',
    'Answer briefly, in plain text.',
    resources.length === 0
      ? 'The user can see no resources.'
      : `The resources the user can see, with their tables and fields:\n${resources.map((model) => resourceBlock(model, views.find((view) => view.resource === model.name))).join('\n')}`,
  ].join('\n\n')
