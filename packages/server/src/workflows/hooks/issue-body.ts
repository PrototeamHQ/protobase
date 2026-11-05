import { badRequest } from '../../problem'

const invalidBody = () => badRequest('invalid-body', 'Send nothing, or { "secret": "<secret>" } to keep a secret the sender gives')

/** The issue request's body: nothing, or `{ secret }`; anything else, malformed JSON included, is a 400 `invalid-body`. */
export const parseIssueBody = (text: string): { secret?: string } => {
  if (text === '') return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw invalidBody()
    throw error
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalidBody()
  const { secret } = body as { secret?: unknown }
  if (secret === undefined) return {}
  if (typeof secret !== 'string') throw invalidBody()
  return { secret }
}
