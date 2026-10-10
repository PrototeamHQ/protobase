import type { AssistantWidgetPart } from '@protobase/schema'

const componentName = /^[A-Z][A-Za-z0-9]*$/

/** The most a widget's props may take, as JSON in UTF-8: room for ids and settings, not for the state it shows. */
export const maxWidgetPropsBytes = 2048

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

// A value that JSON keeps as it is: no undefined, functions, dates, class instances or non-finite numbers.
const isJson = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  return isPlainObject(value) && Object.values(value).every(isJson)
}

export type WidgetOptions = { id?: string; fallback?: AssistantWidgetPart['fallback'] }

/**
 * A widget part for `show`: the app's component `name` draws it with `props`, fetching what it shows itself. A name
 * that is not PascalCase, or props that are not a JSON object of at most 2 KB, throw, so a tool cannot keep state in
 * the chat by accident. Without an `id`, the part gets a new one; show a part with the same id again to replace it.
 */
export const widget = (name: string, props: Record<string, unknown>, options: WidgetOptions = {}): AssistantWidgetPart => {
  if (!componentName.test(name)) throw new Error(`Widget name "${name}" must be PascalCase, such as TaskProposal`)
  if (!isPlainObject(props) || !isJson(props)) throw new Error(`The props of widget ${name} must be a JSON object`)
  const bytes = new TextEncoder().encode(JSON.stringify(props)).length
  if (bytes > maxWidgetPropsBytes) throw new Error(`The props of widget ${name} take ${bytes} bytes, more than ${maxWidgetPropsBytes}; pass ids and let the widget fetch the rest`)
  const { id = crypto.randomUUID(), fallback } = options
  return { type: 'widget', id, name, props, ...(fallback && { fallback }) }
}
