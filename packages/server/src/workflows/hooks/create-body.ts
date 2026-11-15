import { badRequest } from '../../problem'
import type { Row } from '../../types'
import type { GoLive } from './create-workflow'

const invalidBody = (detail: string) => badRequest('invalid-body', detail)

/**
 * A one-call create's body: the workflow's fields, as `POST <basePath>/workflows` takes them, with `publish` (true or
 * false) and `webhook_secret` (text) beside them; malformed JSON, a body that is no object, or either of those of
 * another type is a 400 `invalid-body`.
 */
export const parseCreateBody = (text: string): { fields: Row; live: GoLive } => {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw invalidBody('Send the workflow as a JSON object')
    throw error
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalidBody('Send the workflow as a JSON object')
  const { publish, webhook_secret: secret, ...fields } = body as Row
  if (publish !== undefined && typeof publish !== 'boolean') throw invalidBody('publish is true or false')
  if (secret !== undefined && typeof secret !== 'string') throw invalidBody('webhook_secret is text')
  return { fields, live: { ...(publish !== undefined && { publish }), ...(secret !== undefined && { secret }) } }
}
