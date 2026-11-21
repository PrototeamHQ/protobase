import { withLookupRead } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { lookupLink } from '@protobase/schema/internal'

/**
 * The models as the scan guard judges a read of them: each with its lookup fields among its fields, read in no
 * caller's scope, since doctor judges what any caller may ask. A lookup whose linked record cannot be found is left
 * out; the server's startup check names it.
 */
export const lookupReadModels = (models: ResourceModel[]): ResourceModel[] => {
  const byName = new Map(models.map((model) => [model.name, model]))
  return models.map((model) => {
    const { lookups, ...rest } = model
    if (!lookups) return model
    const read = Object.values(lookups).flatMap((field) => {
      const link = lookupLink(model, field, (name) => byName.get(name))
      return link ? [[field.name, withLookupRead(field, { model: link.linked, scope: {}, conditions: [], value: link.value, match: link.match, link: link.link })] as const] : []
    })
    return { ...rest, fields: { ...model.fields, ...Object.fromEntries(read) } }
  })
}
