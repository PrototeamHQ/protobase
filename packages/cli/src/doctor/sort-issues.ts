import type { ResourceModel } from '@protobase/schema'
import type { Issue } from './check'
import type { ReadShape } from './read-shape'

/**
 * The reads of `model` that sort by a field it does not mark `.sortable()`, which the API refuses: one error per field,
 * naming each read that sorts by it and where it comes from, the order a list opens in included.
 */
export const sortIssues = (model: ResourceModel, shapes: ReadShape[]): Issue[] => {
  const refused = new Map<string, Map<string, string[]>>()
  for (const shape of shapes) {
    if (shape.resource !== model.name) continue
    for (const [name] of shape.query.sort ?? []) {
      const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
      if (field?.sortable !== false) continue
      const requests = refused.get(name) ?? new Map<string, string[]>()
      const from = requests.get(shape.request) ?? []
      if (!from.includes(shape.from)) requests.set(shape.request, [...from, shape.from])
      refused.set(name, requests)
    }
  }
  return [...refused].map(([name, requests]) => ({
    severity: 'error',
    resource: model.name,
    message: `${name}: not sortable, so the API refuses:${[...requests].map(([request, from]) => `\n            ${request} (${from.join('; ')})`).join('')}`,
    suggestion: `mark "${name}" .sortable() in data.ts, or sort the list by a sortable field`,
  }))
}
