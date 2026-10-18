import { sql } from 'kysely'
import { appPath } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { badRequest, notFound } from '../problem'
import type { Entry } from '../registry'
import { tenantScope } from '../tenant'
import { writeTransaction } from '../transactions'
import type { Session } from '../types'
import { commentAccess, mayRead, readableRecord, requireSignedIn, userSessions } from './comment-access'
import { parseCommentInput } from './comment-input'
import { commentColumns, commentItem, namedUsers, type CommentItem, type CommentRow } from './comment-item'
import { commentsTable } from './comments-sql'
import { readableTitle, recordLabel } from './record-label'

const invalidMention = () => badRequest('invalid-mention', 'Someone you mentioned cannot read this record')

/**
 * Adds the caller's comment to a record they may read, live rather than soft-deleted, and enqueues the email of each
 * person it mentions, who must be able to read the record too, in the same transaction. `requestURL` is the request's,
 * whose origin the emailed link takes when the app is served there (see `Deps.comments`).
 */
export const postComment = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], body: unknown, requestURL: string): Promise<CommentItem> => {
  const access = await commentAccess(deps, entry, session)
  requireSignedIn(session)
  const author = String(session.user.id)
  const input = parseCommentInput(body, author)
  const { users, mentionJob, appOrigin } = deps.comments ?? {}
  if (input.mentions.length > 0 && !(users && mentionJob)) throw invalidMention()
  const mentioned = await userSessions(deps, session, input.mentions)
  const tenant = tenantScope(entry, session)?.tenantValue
  const title = readableTitle(access, deps.views)

  const row = await writeTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const current = await readableRecord(trx, access, key, 'hide', title === undefined ? [] : [title])
    if (!current) return undefined
    for (const { session: theirs } of mentioned) if (!(await mayRead(trx, deps, entry, theirs, key))) throw invalidMention()
    const { rows } = await sql<CommentRow>`insert into ${sql.raw(commentsTable)} ("resource", "record_key", "tenant_id", "author_id", "body", "mentions")
      values (${entry.name}, ${encodeKey(key)}, ${tenant === undefined ? null : String(tenant)}, ${author}, ${input.body}, ${JSON.stringify(input.mentions)}::jsonb)
      returning ${sql.raw(commentColumns)}`.execute(trx)
    const inserted = rows[0]!
    if (input.mentions.length === 0) return inserted
    const url = `${appOrigin!(requestURL)}${appPath({ kind: 'record', resource: entry.name, key })}`
    const record = recordLabel(access, deps.views, key, current.record)
    for (const user of input.mentions) await mentionJob!.enqueue(trx, { comment: inserted.id, user, url, record }, { key: `${inserted.id}:${user}` })
    return inserted
  })
  if (!row) throw notFound(`No ${entry.name} with this key`)
  const names = deps.comments?.users ? await deps.comments.users.names(namedUsers([row])) : {}
  return commentItem(row, names)
}
