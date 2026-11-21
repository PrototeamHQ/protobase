import type { FieldModel, ResourceModel } from '../model'

/**
 * How a lookup field reaches its linked record: the linked resource, the linked field it shows (`value`), the linked
 * record's field matched (`match`: its key, or its relation that points at this record) and this record's field
 * matched with it (`link`: its relation, or its key). Undefined while a resource or field it names is missing, which the
 * server's startup check reports.
 */
export const lookupLink = (model: ResourceModel, field: FieldModel, find: (name: string) => ResourceModel | undefined) => {
  const { via, from, field: shown } = field.lookup!
  const own = from === undefined
  const linked = find(own ? (model.fields[via]?.relation?.resource ?? '') : from)
  if (!linked) return
  const pick = (of: ResourceModel, name: string | undefined) => (name !== undefined && Object.hasOwn(of.fields, name) ? of.fields[name] : undefined)
  // A relation's key is in the column `.columns()` names, which may differ from the field's own
  const stored = (field: FieldModel | undefined) => (field?.relation ? { ...field, column: field.relation.columns[0]! } : field)
  const value = pick(linked, shown)
  const match = stored(own ? pick(linked, linked.primaryKey[0]) : pick(linked, via))
  const link = stored(own ? pick(model, via) : pick(model, model.primaryKey[0]))
  if (!value || !match || !link) return
  return { linked, value, match, link }
}
