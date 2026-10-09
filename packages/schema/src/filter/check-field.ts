import type { FieldModel, FieldPath, FilterError, ResourceModel } from '../model'
import { filterError, suggest } from './errors'

export type CheckContext = { model: ResourceModel; errors: FilterError[] }

export const findField = (model: ResourceModel, name: string) =>
  Object.hasOwn(model.fields, name)
    ? model.fields[name]
    : Object.values(model.fields).find((field) => field.aliases.includes(name))

export const resolveField = (
  ctx: CheckContext,
  path: FieldPath,
  capability: 'filterable' | 'sortable',
): FieldModel | undefined => {
  if (path.path.length > 1) {
    ctx.errors.push(
      filterError(
        'unsupported-traversal',
        `Traversal into "${path.path.join('.')}" is not supported yet`,
        'Filter on fields of this resource only',
        path.span,
      ),
    )
    return undefined
  }
  const name = path.path[0]!
  const field = findField(ctx.model, name)
  if (!field) {
    const usable = Object.values(ctx.model.fields).filter((f) => f[capability]).map((f) => f.name)
    const close = suggest(name, usable)
    ctx.errors.push(
      filterError(
        'unknown-field',
        `Unknown field "${name}"`,
        close ? `Did you mean "${close}"?` : `Available fields: ${usable.join(', ')}`,
        path.span,
      ),
    )
    return undefined
  }
  if (!field[capability]) {
    const method = capability === 'filterable' ? 'filterable' : 'sortable'
    ctx.errors.push(
      filterError(
        capability === 'filterable' ? 'not-filterable' : 'not-sortable',
        `Field "${field.name}" is not ${method}`,
        `Mark it with .${method}() in data.ts`,
        path.span,
      ),
    )
    return undefined
  }
  return field
}
