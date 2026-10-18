import { z } from 'zod'
import { badRequest } from '../problem'

/** The longest comment, in characters, after trimming. */
export const maxCommentLength = 10_000
/** The most people one comment mentions. */
export const maxMentions = 20

const input = z.object({
  body: z.string(),
  mentions: z.array(z.string().min(1)).max(maxMentions).optional(),
})

/**
 * A comment as `author` posts it: the body trimmed, not empty and at most `maxCommentLength` long, and the user ids it
 * mentions once each, without the author's own.
 */
export const parseCommentInput = (body: unknown, author: string) => {
  const parsed = input.safeParse(body)
  if (!parsed.success) throw badRequest('invalid-comment', `The comment is invalid: ${parsed.error.issues[0]!.path.join('.') || 'body'}: ${parsed.error.issues[0]!.message}`)
  const text = parsed.data.body.trim()
  if (text === '') throw badRequest('invalid-comment', 'The comment is empty')
  if (text.length > maxCommentLength) throw badRequest('invalid-comment', `The comment is longer than ${maxCommentLength} characters`)
  const mentions = [...new Set(parsed.data.mentions ?? [])].filter((id) => id !== author)
  return { body: text, mentions }
}
