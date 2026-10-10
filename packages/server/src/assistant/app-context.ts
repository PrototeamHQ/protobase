import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { ChatMessage } from './chat-completions'

const fieldLine = (field: FieldModel, view: ViewModel | undefined) => {
  const label = view?.fields[field.name]?.label
  const traits = [
    field.type === 'enum' && field.enumValues ? `one of ${field.enumValues.join(', ')}` : field.type,
    field.relation && `links to ${field.relation.resource}`,
    field.nullable && 'optional',
    field.readOnly && 'read-only',
  ].filter(Boolean)
  return `  - ${field.name}${label ? ` ("${label}")` : ''}: ${traits.join(', ')}`
}

const resourceBlock = (model: ResourceModel, view: ViewModel | undefined) => {
  const names = view?.names ? ` (${view.names.plural})` : ''
  const help = view?.help ? `\n  ${view.help}` : ''
  return `- ${model.name}${names}${help}\n${Object.values(model.fields).map((field) => fieldLine(field, view)).join('\n')}`
}

/**
 * The system prompt: what the app is, from what the caller may see of it in `/meta` (their restricted models and
 * views), never its data. The assistant answers questions only.
 */
export const appContext = (resources: ResourceModel[], views: ViewModel[]): ChatMessage => ({
  role: 'system',
  content: [
    'You are the assistant inside an admin app built with Protobase. You answer questions about the app: what its resources and fields mean, how they relate and how to find or do things in it.',
    'You cannot see or change its data, run queries or change the app; say so when asked, and suggest where in the app to look instead.',
    'Answer briefly, in plain text.',
    resources.length === 0 ? 'The user can see no resources.' : `The resources the user can see, with their fields:\n${resources.map((model) => resourceBlock(model, views.find((view) => view.resource === model.name))).join('\n')}`,
  ].join('\n\n'),
})
