import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { badRequest, HttpProblem } from '../problem'

/** The largest body a history request takes, in bytes. */
export const maxHistoryBodyBytes = 1024

/** Refuses a body that is not `application/json`, so no plain form posted from another site reaches a mark. */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw new HttpProblem(415, 'json-only', 'Unsupported Media Type', 'Send application/json')
  await next()
}

export const limitedBody = bodyLimit({
  maxSize: maxHistoryBodyBytes,
  onError: () => {
    throw new HttpProblem(413, 'too-large', 'Payload Too Large', `The body is larger than ${maxHistoryBodyBytes} bytes`)
  },
})

/** The request's JSON body, `undefined` when it is empty, or a 400 when it is no JSON. */
export const jsonBody = async (c: Context) => {
  const text = await c.req.text()
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) throw badRequest('invalid-json', 'The body is not JSON')
    throw error
  }
}

/** The query's parameters, each at most once, or a 400 naming the first that is none of `allowed`. */
export const queryOf = <K extends string>(c: Context, allowed: readonly K[]) => {
  const given = c.req.queries()
  const query: Partial<Record<K, string>> = {}
  for (const [key, values] of Object.entries(given)) {
    if (!(allowed as readonly string[]).includes(key)) throw badRequest('unknown-parameter', `This endpoint takes no parameter "${key.slice(0, 64)}"`)
    if (values.length !== 1) throw badRequest('repeated-parameter', `The parameter "${key}" is given more than once`)
    query[key as K] = values[0]!
  }
  return query
}
