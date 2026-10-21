import { Hono, type Context } from 'hono'
import { sql } from 'kysely'
import type { Entry } from '../registry'
import { tableId } from '../sql-parts'
import { contentRange } from './content-range'
import { embedsOf, resolveShape, type ShapeItem } from './embed-shape'
import type { ForeignKeys } from './foreign-keys'
import type { Filter } from './parse-filter'
import type { OrderTerm } from './parse-order'
import { parsePrefer, type Preferences } from './parse-prefer'
import { parseQuery, type RestQuery } from './parse-query'
import { readRows } from './read-rows'
import { checkSingle, jsonType, objectType, onlyElement, pageResponse, wantsObject } from './respond'
import { asCaller, queryParams, readBody, type RestDeps, type RestEnv } from './rest-context'
import { restError } from './rest-error'
import { scanRefusal, uncoveredReads } from './rest-scan'
import { deleteRows, insertRows, updateRows, type Returning, type WriteTarget, type Written } from './write-rows'

/**
 * The resource whose table `name` is, in the `public` schema or the search path's: `/api/sb/rest/v1` serves the tables the app
 * declares as resources, as PostgREST serves those of its exposed schema. Any other is 404 (PGRST205).
 */
const servedEntry = (deps: RestDeps, name: string) =>
  deps.registry.entries.find((one) => one.model.table.name === name && (one.model.table.schema ?? 'public') === 'public')

const tableEntry = (deps: RestDeps, name: string) => {
  const entry = servedEntry(deps, name)
  if (!entry) throw restError(404, 'PGRST205', `Could not find the table 'public.${name}' in the schema cache`)
  return entry
}

/** The select list of the query on rows of `entry`'s table, its embeds resolved through the foreign keys of served tables. */
const shapeOf = async (deps: RestDeps, foreignKeys: ForeignKeys, entry: Entry, query: RestQuery): Promise<ShapeItem[]> => {
  if (!query.select.some((item) => item.kind === 'embed')) return query.select as ShapeItem[]
  const served = (name: string) => {
    const target = servedEntry(deps, name)
    return target && tableId(target.model)
  }
  return resolveShape({ foreignKeys: await foreignKeys(), served, embedded: query.embedded }, entry.model.table.name, query.select)
}

const targetOf = (entry: Entry): WriteTarget => ({ table: tableId(entry.model), alias: entry.model.table.name })

/**
 * Refuses filters and a sort no index serves, as the scan guard does on `/api/v1`, on the table and on every embedded
 * one, whose join columns need an index too; in `warn` mode, a warning header instead.
 */
const scanCheck = async (deps: RestDeps, entry: Entry, filters: readonly Filter[], order: readonly OrderTerm[], shape: readonly ShapeItem[] = []): Promise<Record<string, string>> => {
  if (deps.guard.mode === 'off') return {}
  const reads = [
    { entry, filters, order, joined: [] as string[] },
    ...embedsOf(shape).map((embed) => ({ entry: tableEntry(deps, embed.table), filters: embed.params.filters, order: embed.params.order, joined: embed.relationship.join.map((pair) => pair.target) })),
  ]
  for (const read of reads) {
    const [first] = uncoveredReads(await deps.guard.indexesOf(read.entry), read.filters, read.order, read.joined)
    if (!first) continue
    const refusal = scanRefusal(read.entry.model.table, first)
    if (deps.guard.mode === 'warn') return { 'X-Protobase-Warning': refusal.body.message }
    throw refusal
  }
  return {}
}

const returningOf = (prefer: Preferences, shape: ShapeItem[]): Returning => (prefer.return === 'representation' ? { shape } : undefined)

const counted = (prefer: Preferences, total: number) => (prefer.count === undefined ? undefined : total)

/** A write's response: the rows it returns when asked for, as an array or one object; else no body, with `emptyStatus`. */
const writeResponse = (written: Written, object: boolean, status: number, emptyStatus: number, range: string) => {
  if (written.body === undefined) return new Response(null, { status: emptyStatus, headers: { 'content-range': range } })
  return new Response(object ? onlyElement(written.body) : written.body, { status, headers: { 'content-range': range, 'content-type': object ? objectType : jsonType } })
}

const withHeaders = (response: Response, headers: Record<string, string>) => {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  return response
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The rows and columns of an insert's body: an object or an array of objects. The columns are `columns` when given,
 * as supabase-js sends with several rows; otherwise the keys, which every row must then share (PGRST102).
 */
const insertRowsOf = (body: unknown, query: RestQuery) => {
  const rows = Array.isArray(body) ? body : [body]
  if (!rows.every(isRecord)) throw restError(400, 'PGRST102', 'Empty or invalid json')
  if (query.columns) return { rows, columns: query.columns }
  const columns = Object.keys(rows[0] ?? {})
  const same = (row: Record<string, unknown>) => Object.keys(row).length === columns.length && columns.every((column) => Object.hasOwn(row, column))
  if (!rows.every(same)) throw restError(400, 'PGRST102', 'All object keys must match')
  return { rows, columns }
}

const read = async (deps: RestDeps, foreignKeys: ForeignKeys, c: Context<RestEnv>) => {
  const entry = tableEntry(deps, c.req.param('table')!)
  const query = parseQuery(queryParams(c), c.req.header('range') ?? null)
  const prefer = parsePrefer(c.req.header('prefer') ?? null)
  const shape = await shapeOf(deps, foreignKeys, entry, query)
  const warning = await scanCheck(deps, entry, query.filters, query.order, shape)
  const alias = entry.model.table.name
  const source = { from: sql`${tableId(entry.model)} as ${sql.id(alias)}`, alias }
  const page = await asCaller(deps, c, true, (trx) => readRows(trx, source, shape, query, prefer.count))
  return pageResponse(page, query.range.offset, wantsObject(c.req.raw), warning)
}

const insert = async (deps: RestDeps, foreignKeys: ForeignKeys, c: Context<RestEnv>) => {
  const entry = tableEntry(deps, c.req.param('table')!)
  const query = parseQuery(queryParams(c))
  const prefer = parsePrefer(c.req.header('prefer') ?? null)
  const object = wantsObject(c.req.raw)
  const shape = await shapeOf(deps, foreignKeys, entry, query)
  const warning = await scanCheck(deps, entry, [], [], shape)
  const { rows, columns } = insertRowsOf(await readBody(c), query)
  // A row without columns takes every default, which Postgres writes one row at a time.
  if (columns.length === 0 && rows.length > 1) throw restError(400, 'PGRST102', 'Several rows without any column cannot be inserted at once')
  if (rows.length === 0 && object) checkSingle(0)
  const conflict = query.onConflict ?? entry.model.primaryKey.map((name) => entry.model.fields[name]!.column)
  const written: Written = rows.length === 0 ? { total: 0, ...(prefer.return === 'representation' && { body: '[]' }) } : await asCaller(deps, c, false, async (trx) => {
    const result = await insertRows(trx, targetOf(entry), { rows, columns, defaults: prefer.missing === 'default', resolution: prefer.resolution, conflict }, returningOf(prefer, shape))
    if (object) checkSingle(result.total)
    return result
  })
  // An upsert that only updated rows is 200, as a PUT that replaced a row is.
  const status = written.inserted === 0 ? 200 : 201
  return withHeaders(writeResponse(written, object, status, status, `*/${counted(prefer, written.total) ?? '*'}`), warning)
}

const update = async (deps: RestDeps, foreignKeys: ForeignKeys, c: Context<RestEnv>) => {
  const entry = tableEntry(deps, c.req.param('table')!)
  const query = parseQuery(queryParams(c))
  const prefer = parsePrefer(c.req.header('prefer') ?? null)
  const object = wantsObject(c.req.raw)
  const body = await readBody(c)
  if (!isRecord(body)) throw restError(400, 'PGRST102', 'Empty or invalid json')
  const shape = await shapeOf(deps, foreignKeys, entry, query)
  const warning = await scanCheck(deps, entry, query.filters, [], shape)
  const written: Written = Object.keys(body).length === 0
    ? { total: 0, ...(prefer.return === 'representation' && { body: '[]' }) }
    : await asCaller(deps, c, false, async (trx) => {
      const result = await updateRows(trx, targetOf(entry), body, query.filters, returningOf(prefer, shape))
      if (object) checkSingle(result.total)
      return result
    })
  return withHeaders(writeResponse(written, object, 200, 204, contentRange(0, written.total, counted(prefer, written.total))), warning)
}

const remove = async (deps: RestDeps, foreignKeys: ForeignKeys, c: Context<RestEnv>) => {
  const entry = tableEntry(deps, c.req.param('table')!)
  const query = parseQuery(queryParams(c))
  const prefer = parsePrefer(c.req.header('prefer') ?? null)
  const object = wantsObject(c.req.raw)
  const shape = await shapeOf(deps, foreignKeys, entry, query)
  const warning = await scanCheck(deps, entry, query.filters, [], shape)
  const written = await asCaller(deps, c, false, async (trx) => {
    const result = await deleteRows(trx, targetOf(entry), query.filters, returningOf(prefer, shape))
    if (object) checkSingle(result.total)
    return result
  })
  return withHeaders(writeResponse(written, object, 200, 204, `*/${counted(prefer, written.total) ?? '*'}`), warning)
}

/**
 * `/api/sb/rest/v1/<table>`: read with GET and HEAD, insert and upsert with POST, update with PATCH, delete with DELETE. Reads
 * and the rows a write returns embed related rows through `foreignKeys`.
 */
export const tableRoutes = (deps: RestDeps, foreignKeys: ForeignKeys) => {
  const app = new Hono<RestEnv>()
  app.get('/:table', (c) => read(deps, foreignKeys, c))
  app.post('/:table', (c) => insert(deps, foreignKeys, c))
  app.patch('/:table', (c) => update(deps, foreignKeys, c))
  app.delete('/:table', (c) => remove(deps, foreignKeys, c))
  return app
}
