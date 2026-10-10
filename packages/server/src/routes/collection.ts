import { Hono } from 'hono'
import { facets, numericHistogram, timeSeries } from '../aggregate-service'
import type { Deps } from '../deps'
import { listRecords } from '../list-service'
import { encodeKey } from '@protobase/schema'
import type { AdminEnv } from '../types'
import { uploadFile } from '../files/upload'
import { runWrite } from '../write-pipeline'
import { returnPreference } from './preferences'
import { resolveTarget, unknownAction } from './target'

/** Filters in a JSON body may be much longer than in a URL. */
const searchFilterLength = 200_000

const warningHeader = (warning?: string): Record<string, string> => (warning ? { 'X-Protobase-Warning': warning } : {})

export const collectionRoutes = (deps: Deps) => {
  const app = new Hono<AdminEnv>()

  app.get('/:target', async (c) => {
    const { entry, action } = resolveTarget(deps, c.req.param('target'))
    const session = c.get('session')
    const query = c.req.query()
    if (action === '') {
      const { body, warning } = await listRecords(deps, entry, session, query)
      return c.json(body, 200, warningHeader(warning))
    }
    if (action === 'facets') return c.json(await facets(deps, entry, session, query))
    if (action === 'series') return c.json(await timeSeries(deps, entry, session, query))
    if (action === 'histogram') return c.json(await numericHistogram(deps, entry, session, query))
    if (action === 'seek') {
      const { body, warning } = await listRecords(deps, entry, session, query, undefined, true)
      return c.json(body, 200, warningHeader(warning))
    }
    return unknownAction(action)
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
