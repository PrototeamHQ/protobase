import { sql } from 'kysely'
import { z } from 'zod'
import { defineJob } from '../jobs/define-job'
import type { CommentUsers } from './comment-users'
import { commentsTable } from './comments-sql'

const payload = z.object({ comment: z.string().regex(/^\d+$/), user: z.string().min(1), url: z.string().url(), record: z.string() })

export type MentionPayload = z.infer<typeof payload>

/**
 * The job that emails someone a comment mentions, enqueued with the comment: nothing when the app has no mail, when an
 * admin deleted the comment since, or when the user is banned or gone. A refused send is retried.
 */
export const mentionJob = (users: CommentUsers | undefined, appName: string) =>
  defineJob({
    name: 'comments.mention',
    payload,
    retryDelay: '1 minute',
    run: async ({ comment, user, url, record }, { db, mail }) => {
      if (!mail) return
      // The comment refuses mentions without the project's auth, so no such job is enqueued.
      if (!users) throw new Error('Not implemented: mentions need Better Auth')
      const { rows } = await sql<{ author_id: string; body: string }>`select "author_id", "body" from ${sql.raw(commentsTable)} where "id" = ${comment}::bigint`.execute(db)
      const found = rows[0]
      if (!found) return
      const to = await users.email(user)
      if (!to) return
      const author = (await users.names([found.author_id]))[found.author_id] ?? found.author_id
      const { mentionEmail } = await import('./mention-email')
      await mentionEmail.send(to, { app: { name: appName, url: new URL('/', url).href }, author, record, body: found.body, url }, mail)
    },
  })
