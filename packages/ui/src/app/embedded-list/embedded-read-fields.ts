import type { ResourceModel, ViewModel } from '@protobase/schema'
import { recordTitleField } from '../../live/model-helpers'
import { titleFieldsOf } from '../titles/record-title-of'

type Read = {
  /** The fields its table and displays show, paths through relations (`unit_id.property_id`) among them. */
  shown: string[]
  /** The relation whose record a row opens instead of its own. */
  opens?: string
  /** Whether the view's `bulk` actions run on its selected rows. */
  bulk: boolean
}

/**
 * The fields an embedded list reads its rows with: those it shows (a path by the relation it starts at), the key that
 * addresses each row, the relation a row opens and the fields its title reads, among those the reader may see. With
 * `bulk` it reads whole records, `undefined`, since the view's actions get the record they run on and a handler may
 * read any field of it.
 */
export const embeddedReadFields = (model: ResourceModel, view: ViewModel | undefined, { shown, opens, bulk }: Read) => {
  if (bulk) return
  const wanted = [...model.primaryKey, ...shown.map((name) => name.split('.')[0]!), ...(opens ? [opens] : []), recordTitleField(model, view), ...titleFieldsOf(model, view)]
  return [...new Set(wanted)].filter((name) => Object.hasOwn(model.fields, name))
}
