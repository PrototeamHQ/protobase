import { columnName, type TableProps } from '@protobase/layout'
import { embeddedFields } from '../../embedded-list/embedded-fields'
import { embeddedRowsQuery } from '../../embedded-list/use-embedded-rows'
import { defaultOrderBy } from '../../list-order'
import { blockQuery, type BlockQueries } from '../block-query'
import { firstRecordQuery } from '../use-layout-data'
import { propsOf } from './block-props'
import { phoneSpecs } from './table-phone-columns'

/**
 * A `Table`'s rows as `EmbeddedList` reads them, with their labels, photos and total, and with `select` the chosen
 * row as `ChosenRecord` reads it; a table of the list around it has no read of its own.
 */
export const tableQueries: BlockQueries = (node, read, reader) => {
  const { resource, filter = '', sort = '', columns, button, bulk = false, limit = 10, select } = propsOf<TableProps>(node)
  const model = resource === undefined ? undefined : reader.resources[resource]
  if (!model) return []
  if (read.part === 'chosen') {
    const key = select === undefined ? undefined : reader.params[select]
    return key ? [blockQuery(firstRecordQuery(reader.client, model, { key }))] : []
  }
  const view = reader.views[model.name]
  const { fields, read: readFields } = embeddedFields({ ...reader, model, view, columns: columns?.map(columnName), button, bulk, phoneColumns: phoneSpecs(columns) })
  return [blockQuery(embeddedRowsQuery(reader, { model, filter, orderBy: sort || defaultOrderBy(model, view), limit, fields, read: readFields }))]
}
