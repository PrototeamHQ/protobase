import type { PageModel } from '@protobase/layout'
import { lookupQueries } from '@protobase/query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fieldShapes, lookupShapes } from './field-shapes'
import { pageShapes } from './page-shapes'
import type { ReadShape } from './read-shape'
import { viewShapes } from './view-shapes'

export type ReadShapesInput = { models: ResourceModel[]; views: ViewModel[]; pages: PageModel[] }

// A read of a lookup field also reads its linked records by the linked field, judged against their own table.
const linkedShapes = (shape: ReadShape, byName: Record<string, ResourceModel>): ReadShape[] => {
  const model = byName[shape.resource]
  if (!model) return []
  return lookupQueries(model, shape.query).map(({ field, read, query }) => ({ resource: read.model.name, request: shape.request, from: `${shape.from}, through the lookup field "${field}"`, query }))
}

/**
 * Every read the API takes of the resources and the app makes of them, which the scan guard judges when it runs: what
 * the fields allow, the relations' lookups, each view's pages and each composed page's blocks, and the linked records
 * each of them reads through a lookup field. `models` have their lookup fields among their fields (`lookupReadModels`).
 */
export const readShapes = ({ models, views, pages }: ReadShapesInput): ReadShape[] => {
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  const shapes = [
    ...models.flatMap((model) => [...fieldShapes(model), ...lookupShapes(model, byName)]),
    ...views.flatMap((view) => viewShapes(view, byName)),
    ...pages.flatMap((page) => pageShapes(page, byName, views)),
  ]
  return [...shapes, ...shapes.flatMap((shape) => linkedShapes(shape, byName))]
}
