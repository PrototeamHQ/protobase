import type { ResourceModel } from '@protobase/schema'

/** What is wrong with a field of `model` an option `prop` names, which must be of one of `types`; nothing for none named. */
export const typedErrors = (model: ResourceModel, prop: string, name: string | undefined, types: string[], what: string) => {
  if (name === undefined) return []
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  return types.includes(field.type) ? [] : [`${prop}: "${name}" is ${field.type}; ${what}`]
}

/** Whether a caller whose `model` holds only the fields they may read can read `name`. */
export const readable = (model: ResourceModel | undefined, name: string | undefined) => name !== undefined && model !== undefined && Object.hasOwn(model.fields, name)
