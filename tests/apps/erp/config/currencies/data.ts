import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** core.currencies */
export const currencies = resource('currencies')
  .table('core.currencies')
  .fields({
    code: f.text().filterable().sortable(),
    name: f.text(),
    symbol: f.text(),
    decimals: f.integer().default(2),
  })
  .primaryKey((r) => r.code)
  .access(erpAccess('currencies'))
