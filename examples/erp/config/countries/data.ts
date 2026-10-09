import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** core.countries */
export const countries = resource('countries')
  .table('core.countries')
  .fields({
    code: f.text().filterable().sortable(),
    name: f.text(),
    euMember: f.boolean().default(false),
  })
  .primaryKey((r) => r.code)
  .access(erpAccess('countries'))
