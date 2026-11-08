import type { Client, ResourcePermissions } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fakeApi } from './fake-api'
import recorded from './user-tables-meta.json' with { type: 'json' }

// `/meta` of an admin of an app with user tables, as the server answers it (packages/server/tests/user-tables.test.ts).
const resources = recorded.resources as unknown as ResourceModel[]
const views = recorded.views as unknown as ViewModel[]
const permissions = recorded.permissions as unknown as Record<string, ResourcePermissions>

const notesTable = { id: 1, name: 'notes', table_name: 'notes', singular_label: 'Note', plural_label: 'Notes', title_field: 'title', version: 3 }
const notesFields = [
  { table_id: 1, name: 'title', label: 'Title', type: 'text', required: false, position: 1, precision: null, scale: null },
  { table_id: 1, name: 'body', label: 'Body', type: 'long_text', required: false, position: 2, precision: null, scale: null },
]

/**
 * A server of an app with user tables, for an admin. With `made`, the table Notes exists with two fields; without, it
 * has no tables until one named `notes` is created, and `/meta` names Notes only once it is, as the server serves a new
 * table at once and the admin app reads `/meta` again.
 */
export const fakeUserTables = ({ made = true }: { made?: boolean } = {}): { client: Client } => {
  let served = made
  const api = fakeApi({
    resources,
    views,
    permissions,
    rows: { user_tables: made ? [notesTable] : [], user_table_fields: made ? notesFields : [], notes: [{ id: 1, title: 'First note', body: 'Written on a phone.' }] },
    afterWrite: (resource, row) => {
      if (resource !== 'user_tables') return
      // The database names the table after the definition, as it does in an app without organizations.
      row.table_name ??= row.name
      if (row.name === 'notes') served = true
    },
  })
  const meta: Client['meta'] = async (etag) => {
    const answer = await api.client.meta(etag)
    if (served || answer.status !== 'modified') return answer
    return { ...answer, meta: { ...answer.meta, resources: answer.meta.resources.filter((model) => model.name !== 'notes'), views: answer.meta.views.filter((view) => view.resource !== 'notes') } }
  }
  return { client: { ...api.client, meta } }
}
