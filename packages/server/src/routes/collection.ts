import { Hono, type Context } from 'hono'
import { aggregate } from '../aggregate-groups'
import { facets, numericHistogram, timeSeries } from '../aggregate-service'
import { belongingFilter } from '../belongs-to'
import type { Deps } from '../deps'
import { keyFromPath } from '../key'
import { listRecords } from '../list-service'
import { mapRecords } from '../map-service'
import { notFound } from '../problem'
import { encodeKey } from '@protobase/schema/internal'
import type { Entry } from '../registry'
import type { AdminEnv } from '../types'
import { uploadFile } from '../files/upload'
import { runWrite } from '../write-pipeline'
import { returnPreference } from './preferences'
import { resolveTarget, unknownAction } from './target'

/** Filters in a JSON body may be much longer than in a URL. */
const searchFilterLength = 200_000

const warningHeader = (warning?: string): Record<string, string> => (warning ? { 'X-Protobase-Warning': warning } : {})

// The list-style methods that read: a resource's own list, or one under a record with the same parameters.
const listMethod = async (c: Context<AdminEnv>, deps: Deps, entry: Entry, action: string, query: Record<string, string>) => {
  const session = c.get('session')
  if (action === '') {
    const { body, warning } = await listRecords(deps, entry, session, query)
    return c.json(body, 200, warningHeader(warning))
  }
  if (action === 'facets') {
    const { body, warning } = await facets(deps, entry, session, query)
    return c.json(body, 200, warningHeader(warning))
  }
  if (action === 'aggregate') {
    const { body, warning } = await aggregate(deps, entry, session, query)
    return c.json(body, 200, warningHeader(warning))
  }
  if (action === 'series') return c.json(await timeSeries(deps, entry, session, query))
  if (action === 'histogram') return c.json(await numericHistogram(deps, entry, session, query))
  if (action === 'map') {
    const { body, warning } = await mapRecords(deps, entry, session, query)
    return c.json(body, 200, warningHeader(warning))
  }
  if (action === 'seek') {
    const { body, warning } = await listRecords(deps, entry, session, query, undefined, true)
    return c.json(body, 200, warningHeader(warning))
  }
  return unknownAction(action)
}

export const collectionRoutes = (deps: Deps) => {
  const app = new Hono<AdminEnv>()

  app.get('/:target', (c) => {
    const { entry, action } = resolveTarget(deps, c.req.param('target'))
    return listMethod(c, deps, entry, action, c.req.query())
  })

  // The list under a record: its parent's resource and key, and what is listed. A composite key has no such list.
  const underRecord = (c: Context<AdminEnv>) => {
    const { entry: parent } = resolveTarget(deps, c.req.param('parent')!)
    const { entry, action } = resolveTarget(deps, c.req.param('target')!)
    if (parent.keyTypes.length !== 1) throw notFound(`There is no list of ${entry.name} under ${parent.name}`)
    return { parent, entry, action, key: keyFromPath(c, parent) }
  }

  // GET /{parent}/{key}/{resource}: a list of the records that belong to a record, a filter the path spells out
  app.get('/:parent/:key/:target', async (c) => {
    const { parent, entry, action, key } = underRecord(c)
    const query = c.req.query()
    const filter = await belongingFilter(deps, entry, c.get('session'), parent, key, query.filter)
    return listMethod(c, deps, entry, action, { ...query, filter })
  })

  app.post('/:parent/:key/:target', async (c) => {
    const { parent, entry, action, key } = underRecord(c)
    if (action !== 'search') return unknownAction(action)
    const body = (await c.req.json()) as { filter?: unknown }
    const source = typeof body.filter === 'string' ? body.filter : undefined
    const filter = await belongingFilter(deps, entry, c.get('session'), parent, key, source, searchFilterLength)
    const { body: page, warning } = await listRecords(deps, entry, c.get('session'), { ...body, filter }, searchFilterLength)
    return c.json(page, 200, warningHeader(warning))
  })

  app.post('/:target', async (c) => {
    const { entry, action } = resolveTarget(deps, c.req.param('target'))
    const session = c.get('session')
    // POST /{resource}:upload streams a file; every other method takes JSON
    if (action === 'upload') return c.json(await uploadFile(deps, entry, session, c.req.raw), 201)
    const body = await c.req.json()
    if (action === 'search') {
      const { body: page, warning } = await listRecords(deps, entry, session, body, searchFilterLength)
      return c.json(page, 200, warningHeader(warning))
    }
    if (action !== '') return unknownAction(action)
    const created = await runWrite(deps, entry, session, { operation: 'create', body })
    const key = entry.model.primaryKey.map((name) => created.record[name] as string | number)
    // encodeKey already percent-encodes the parts of a composite key
    const location = `${deps.basePath}/${entry.name}/${key.length === 1 ? encodeURIComponent(String(key[0])) : encodeKey(key)}`
    const { minimal, applied } = returnPreference(c)
    const headers = { Location: location, ETag: created.etag, ...applied }
    return minimal ? new Response(null, { status: 201, headers }) : c.json({ ...created.record, etag: created.etag }, 201, headers)
  })

  return app
}
