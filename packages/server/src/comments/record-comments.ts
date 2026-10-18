import { f, l, resource, view, type AccessContext } from '@protobase/schema'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/**
 * Every comment on every resource with comments, over their table: the admin app lists them as Comments. Admins only,
 * whatever the project's roles say, since it spans every record; they may delete one, which is how a wrong or abusive
 * comment goes. With `tenant`, when a resource with comments has one, it is scoped to the caller's tenant.
 */
export const commentsResource = ({ tenant }: { tenant: boolean }) => {
  const comments = resource('record_comments')
    .table('comments.comments')
    .fields({
      id: f.bigint().readOnly().sortable(),
      resource: f.text().readOnly().filterable(),
      record_key: f.text().readOnly().filterable(),
      tenant_id: f.text().optional().readOnly(),
      author_id: f.text().readOnly().filterable(),
      body: f.text().readOnly(),
      mentions: f.json().readOnly(),
      created_at: f.timestamp().readOnly().filterable(),
    })
    .primaryKey((r) => r.id)
    .access({ list: admins, read: admins, create: () => false, update: () => false, delete: admins })
  return tenant ? comments.tenant((r) => r.tenant_id) : comments
}

export const commentsView = view<ReturnType<typeof commentsResource>>('record_comments')
  .names({ singular: 'Comment', plural: 'Comments' })
  .icon('message-square')
  .title((r) => r.record_key)
  .help('Every comment on the records whose resource takes comments, newest first. Delete one to take it down.')
  .fields((r) => ({
    record_key: r.record_key.label('Record'),
    author_id: r.author_id.label('By'),
    body: r.body.label('Comment'),
    mentions: r.mentions.label('Mentions'),
    created_at: r.created_at.label('When'),
  }))
  .list((r) => ({ columns: [r.created_at, r.resource, r.record_key, r.author_id, r.body], sort: [[r.id, 'desc']] }))
  .layout((r) => [l.section('Comment', [r.resource, r.record_key, r.body, r.mentions]), l.sidebar([r.created_at, r.author_id])])
