import type { ResourceModel } from '@protobase/schema'
import type { GridRow } from '../../data-grid'
import { recordId } from '../../live/model-helpers'
import { withLabels } from '../../live/relation-labels'
import { withPhotos } from '../../live/row-photos'
import type { Planned } from '../pages/planned'
import { plannedCount } from '../pages/planned-count'

/** A list's first page from the page's planned read, and how many records match in all, from its total read. */
export type PlannedList = { rows: Planned; total: Planned | undefined }

/**
 * The rows of `planned` as `useEmbeddedRows` gives its own: relations among `fields` named, photos beside them, and
 * the total its total read counts, its rows' count without one.
 */
export const plannedEmbeddedRows = (resources: Record<string, ResourceModel>, model: ResourceModel, fields: string[], { rows, total }: PlannedList) => {
  const isPending = rows.isPending || Boolean(total?.isPending)
  const error = rows.error ?? total?.error ?? null
  if (isPending || error) return { isPending, error, data: undefined }
  const labelled = withLabels(resources, model, fields, withPhotos(model, rows.rows, rows.photos), rows.labels)
  const listed: GridRow[] = labelled.map((row, index) => ({ ...row, id: recordId(model, rows.rows[index]!) }))
  return { isPending, error, data: { rows: listed, total: total ? plannedCount(total) : listed.length, estimated: false } }
}
