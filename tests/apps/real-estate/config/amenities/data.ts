import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.amenities, a reference table shared by every organization. */
export const amenities = resource('amenities')
  .table('portfolio.amenities')
  .fields({
    code: f.text().filterable().sortable(),
    name: f.text(),
  })
  .primaryKey((r) => r.code)
  .access(access('amenities'))
