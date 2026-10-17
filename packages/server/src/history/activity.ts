import { f, l, resource, view, type AccessContext } from '@protobase/schema'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/**
 * Every kept change of every resource with history, over the history table of `schema`: the admin app lists them as
 * Activity. Admins only, whatever the project's roles say, since a change holds the record's fields before and after;
 * read-only. With `tenant`, when a resource with history has one, it is scoped to the caller's tenant.
 */
export const activityResource = (schema: string, { tenant }: { tenant: boolean }) => {
  const changes = resource('record_history')
    .table(`${schema}.history`)
    .fields({
      id: f.bigint().readOnly().sortable(),
      resource: f.text().readOnly().filterable(),
      record_key: f.text().readOnly().filterable(),
      tenant_id: f.text().optional().readOnly(),
      operation: f.enum(['create', 'update', 'delete', 'undelete']).readOnly().filterable(),
      before: f.json().optional().readOnly(),
      after: f.json().optional().readOnly(),
      changed: f.json().readOnly(),
      actor_id: f.text().optional().readOnly().filterable(),
      actor_roles: f.json().optional().readOnly(),
      database_role: f.text().optional().readOnly().filterable(),
      transaction: f.bigint().readOnly().filterable(),
      at: f.timestamp().readOnly().filterable(),
    })
    .primaryKey((r) => r.id)
    .access({ list: admins, read: admins, create: () => false, update: () => false, delete: () => false })
  return tenant ? changes.tenant((r) => r.tenant_id) : changes
}

export const activityView = view<ReturnType<typeof activityResource>>('record_history')
  .names({ singular: 'Change', plural: 'Activity' })
  .icon('history')
  .title((r) => r.record_key)
  .help('Every change of the records whose resource keeps history, from the app or straight in the database, newest first.')
  .fields((r) => ({
    record_key: r.record_key.label('Record'),
    actor_id: r.actor_id.label('By'),
    actor_roles: r.actor_roles.label('Acting as'),
    database_role: r.database_role.label('Database role'),
    changed: r.changed.label('Changed fields'),
    at: r.at.label('When'),
  }))
  .list((r) => ({ columns: [r.at, r.resource, r.record_key, r.operation, r.actor_id, r.changed], sort: [[r.id, 'desc']] }))
  .layout((r) => [
    l.section('Change', [r.resource, r.record_key, r.operation, r.changed]),
    l.section('Before and after', [r.before, r.after]),
    l.sidebar([r.at, r.actor_id, r.actor_roles, r.database_role, r.transaction]),
  ])
