import type { PageModel } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fieldShapes, lookupShapes } from './field-shapes'
import { pageShapes } from './page-shapes'
import type { ReadShape } from './read-shape'
import { viewShapes } from './view-shapes'

export type ReadShapesInput = { models: ResourceModel[]; views: ViewModel[]; pages: PageModel[] }

/**
 * Every read the API takes of the resources and the app makes of them, which the scan guard judges when it runs: what
 * the fields allow, the relations' lookups, each view's pages and each composed page's blocks.
 */
export const readShapes = ({ models, views, pages }: ReadShapesInput): ReadShape[] => {
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  return [
    ...models.flatMap((model) => [...fieldShapes(model), ...lookupShapes(model, byName)]),
    ...views.flatMap((view) => viewShapes(view, byName)),
    ...pages.flatMap((page) => pageShapes(page, byName, views)),
  ]
}
