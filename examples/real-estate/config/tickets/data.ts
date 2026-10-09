import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/**
 * maintenance.tickets. Unique: (organization_id, number). The status only moves forward (reported, scheduled, then done
 * or cancelled); Postgres refuses any other step and stamps `closedAt`. Maintenance staff change the tickets assigned
 * to them (`.own`).
 */
export const tickets = resource('tickets')
  .table('maintenance.tickets')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    propertyId: f.relation('properties').filterable().sortable(),
    unitId: f.relation('units').optional().filterable().sortable(),
    reportedBy: f.relation('tenants').optional().filterable().sortable(),
    assignedTo: f.relation('users').optional().filterable().sortable(),
    category: f.enum(['heating', 'plumbing', 'electrical', 'leak', 'mould', 'locks', 'appliances', 'windows_doors', 'garden', 'pests']).filterable().sortable(),
    priority: f.enum(['low', 'normal', 'high', 'urgent']).default('normal').filterable().sortable(),
    status: f.enum(['reported', 'scheduled', 'done', 'cancelled']).default('reported').filterable().sortable(),
    title: f.text(),
    description: f.text().optional(),
    reportedAt: f.timestamp().filterable().sortable().dbDefault(),
    closedAt: f.timestamp().readOnly().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .owner((r) => r.assignedTo)
  .search((r) => [r.number, r.title])
  .access(access('tickets'))
