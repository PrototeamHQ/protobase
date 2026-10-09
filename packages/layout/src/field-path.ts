import type { FieldModel, ResourceModel } from '@protobase/schema'

/** One step of a field path: the field, and the resource it belongs to. */
export type PathStep = { model: ResourceModel; field: FieldModel }

export type PathResolution = { ok: true; steps: PathStep[] } | { ok: false; message: string }

/**
 * Resolves `plan.name` from `resource`: every name but the last must be a relation, and each next name a field of the
 * resource that relation points at. A missing resource or field is reported as unknown, never as hidden.
 */
export const resolveFieldPath = (models: Record<string, ResourceModel>, resource: string, path: string): PathResolution => {
  const steps: PathStep[] = []
  let model = models[resource]
  const names = path.split('.')
  for (const [index, name] of names.entries()) {
    if (!model) return { ok: false, message: `unknown resource "${resource}"` }
    const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
    if (!field) return { ok: false, message: `unknown field "${names.slice(0, index + 1).join('.')}" on ${model.name}` }
    steps.push({ model, field })
    if (index === names.length - 1) break
    if (field.type !== 'relation' || !field.relation) return { ok: false, message: `"${names.slice(0, index + 1).join('.')}" is not a relation, so "${path}" cannot go through it` }
    resource = field.relation.resource
    model = models[resource]
  }
  return { ok: true, steps }
}
