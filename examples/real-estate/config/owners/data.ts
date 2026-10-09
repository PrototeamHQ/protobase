import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.owners: the landlords whose properties the firm manages. */
export const owners = resource('owners')
  .table('portfolio.owners')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    name: f.text(),
    kind: f.enum(['private', 'company', 'pension_fund', 'housing_association']).filterable().sortable(),
    email: f.text().optional(),
    phone: f.text().optional(),
    iban: f.text().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'An IBAN without spaces, such as NL91ABNA0417164300'),
    managementFeePercent: f.decimal({ precision: 4, scale: 2 }).default('6'),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.name])
  .access(access('owners'))
