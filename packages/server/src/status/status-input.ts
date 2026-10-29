import { availabilities, statusTextProblem, type StatusInput } from '@protobase/schema/internal'
import { z } from 'zod'
import { badRequest } from '../problem'

const body = z.strictObject({
  availability: z.enum(availabilities),
  text: z.string().nullable(),
  clearsAt: z.iso.datetime({ offset: true }).nullable(),
})

/**
 * The status a request sets, checked: an availability, a one-line text of at most `maxStatusText` characters, kept
 * trimmed, an empty one as none, and a clear time to come or `null` for never. Anything else, a user named in it
 * too, is a 400 that says what is wrong.
 */
export const statusInput = (given: unknown, now = new Date()): StatusInput => {
  const parsed = body.safeParse(given)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    throw badRequest('invalid-status', `Send { availability, text, clearsAt }: ${issue.path.join('.') || 'the body'} ${issue.message.toLowerCase()}`)
  }
  const { availability, clearsAt } = parsed.data
  const text = parsed.data.text?.trim() || null
  const problem = text === null ? undefined : statusTextProblem(text)
  if (problem) throw badRequest('invalid-status-text', problem)
  if (clearsAt !== null && Date.parse(clearsAt) <= now.getTime()) throw badRequest('invalid-clear-time', 'A status clears at a time still to come, or never')
  return { availability, text, clearsAt: clearsAt === null ? null : new Date(clearsAt).toISOString() }
}
