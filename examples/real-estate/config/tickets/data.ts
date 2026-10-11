import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/**
 * maintenance.tickets. Unique: (organization_id, number). The status only moves forward (reported, scheduled, then done
 * or cancelled); Postgres refuses any other step and stamps `closed_at`. Maintenance staff change the tickets assigned
 * to them (`.own`).
 */
export const tickets = resource('tickets')
  .table('maintenance.tickets')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    property_id: f.relation('properties').filterable().sortable(),
    unit_id: f.relation('units').optional().filterable().sortable(),
    reported_by: f.relation('tenants').optional().filterable().sortable(),
    assigned_to: f.relation('users').optional().filterable().sortable(),
    category: f.enum(['heating', 'plumbing', 'electrical', 'leak', 'mould', 'locks', 'appliances', 'windows_doors', 'garden', 'pests']).filterable().sortable(),
    priority: f.enum(['low', 'normal', 'high', 'urgent']).default('normal').filterable().sortable(),
    status: f.enum(['reported', 'scheduled', 'done', 'cancelled']).default('reported').filterable().sortable(),
    title: f.text(),
    description: f.text().optional(),
    reported_at: f.timestamp().filterable().sortable().dbDefault(),
    closed_at: f.timestamp().readOnly().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .owner((r) => r.assigned_to)
  .search((r) => [r.number, r.title])
  .access(access('tickets'))
