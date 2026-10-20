import { Hono, type Context } from 'hono'
import { sql } from 'kysely'
import { callSource, chooseFunction, findFunctions } from './functions'
import { parsePrefer } from './parse-prefer'
import { parseQuery } from './parse-query'
import { readRows } from './read-rows'
import { jsonType, onlyElement, pageResponse, wantsObject } from './respond'
import { asCaller, queryParams, readBody, type RestDeps, type RestEnv } from './rest-context'
import { restError } from './rest-error'

const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/**
 * Calls a function of the `public` schema: by POST with its arguments in a JSON object, or the whole body as its one
 * unnamed json argument; by GET with them in the query string, in a read-only transaction. A function returning rows
 * is read like a table, with `select`, filters, `order`, a range and a count; one returning one row gives an object,
 * a scalar its JSON value, `void` 204.
 */
const call = async (deps: RestDeps, c: Context<RestEnv>) => {
  const name = c.req.param('fn')!
  const get = c.req.method === 'GET'
  const params = queryParams(c)
  const body = get ? undefined : await readBody(c, {})
  const prefer = parsePrefer(c.req.header('prefer') ?? null)
  const object = wantsObject(c.req.raw)
  return asCaller(deps, c, get, async (trx) => {
    const candidates = await findFunctions(trx, name)
    const inputs = new Set(candidates.flatMap((info) => info.inputs.map((input) => input.name)))
    const given = get
      ? params.map(([key]) => key).filter((key) => !reserved.has(key) && inputs.has(key))
      : typeof body === 'object' && body !== null && !Array.isArray(body) ? Object.keys(body) : []
    const chosen = chooseFunction(name, candidates, given)
    const args = get ? Object.fromEntries(params.filter(([key]) => given.includes(key))) : body
    const source = callSource(chosen, args)
    const query = parseQuery(params, c.req.header('range') ?? null, new Set(given))
    const shape = query.select.map((item) => {
      if (item.kind === 'embed') throw restError(400, 'PGRST100', `"${item.name}" embeds a resource in a function's rows, which /rest/v1 does not support yet`)
      return item
    })
    if (chosen.info.returns === 'void') {
      await sql`select 1 from ${source.from}`.execute(trx)
      return new Response(null, { status: 204, headers: { 'content-range': '0-0/*' } })
    }
    if (!chosen.info.set) {
      const page = await readRows(trx, source, shape, query)
      return new Response(onlyElement(page.body), { status: 200, headers: { 'content-range': '0-0/*', 'content-type': jsonType } })
    }
    return pageResponse(await readRows(trx, source, shape, query, prefer.count), query.range.offset, object)
  })
}

export const rpcRoute = (deps: RestDeps) => {
  const app = new Hono<RestEnv>()
  app.on(['GET', 'POST'], '/rpc/:fn', (c) => call(deps, c))
  return app
}
