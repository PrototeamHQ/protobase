import { Hono, type Context } from 'hono'
import type { Deps } from '../deps'
import { keyFromPath } from '../key'
import { deletedRows, selectedFields } from '../params'
import { pickFields } from '../rows'
import { readRecord } from '../read-service'
import type { Entry } from '../registry'
import { revealField } from '../reveal-service'
import type { AdminEnv } from '../types'
import { runWrite } from '../write-pipeline'
import { notFound } from '../problem'
import { resolveTarget } from './target'
import { returnPreference } from './preferences'

const headerValue = (name: string, value: string | undefined) => (value === undefined ? {} : { [name]: value })

export const recordRoutes = (deps: Deps) => {
  const app = new Hono<AdminEnv>()

  app.get('/:resource/:key', async (c) => {
    const { entry } = resolveTarget(deps, c.req.param('resource'))
    const deleted = deletedRows(entry.model, c.req.query('show_deleted') === 'true')
    const found = await readRecord(deps, entry, c.get('session'), keyFromPath(c, entry), deleted)
    // `fields` is checked against the caller's own readable fields
    const columns = selectedFields({ ...entry.model, fields: Object.fromEntries(Object.keys(found.record).map((name) => [name, entry.model.fields[name]!])) }, c.req.query('fields'))
    return c.json({ ...pickFields(found.record, columns), etag: found.etag, permissions: found.permissions }, 200, { ETag: found.etag })
  })

  // POST /{resource}/{key}:reveal with `{ "field": "iban" }`: one sensitive value, published to the audit queue
  const reveal = async (c: Context<AdminEnv>, entry: Entry) => {
    const body: unknown = await c.req.json()
    const revealed = await revealField(deps, entry, c.get('session'), {
      key: keyFromPath(c, entry, ':reveal'),
      field: typeof body === 'object' && body !== null ? (body as { field?: unknown }).field : undefined,
      origin: { ...headerValue('userAgent', c.req.header('user-agent')), ...headerValue('forwardedFor', c.req.header('x-forwarded-for')) },
    })
    return c.json(revealed, 200, { 'Cache-Control': 'no-store' })
  }

  // AIP-164: POST /{resource}/{key}:undelete
  app.post('/:resource/:key', async (c) => {
    const { entry } = resolveTarget(deps, c.req.param('resource'))
    if (c.req.param('key').endsWith(':reveal')) return reveal(c, entry)
    if (!c.req.param('key').endsWith(':undelete')) throw notFound('There is no such method')
    const restored = await runWrite(deps, entry, c.get('session'), {
      operation: 'undelete',
      key: keyFromPath(c, entry, ':undelete'),
      ifMatch: c.req.header('if-match') ?? null,
    })
    const { minimal, applied } = returnPreference(c)
    const headers = { ETag: restored.etag, ...applied }
    return minimal ? new Response(null, { status: 204, headers }) : c.json({ ...restored.record, etag: restored.etag }, 200, headers)
  })

  app.patch('/:resource/:key', async (c) => {
    const { entry } = resolveTarget(deps, c.req.param('resource'))
    const updated = await runWrite(deps, entry, c.get('session'), {
      operation: 'update',
      key: keyFromPath(c, entry),
      body: await c.req.json(),
      ifMatch: c.req.header('if-match') ?? null,
    })
    const { minimal, applied } = returnPreference(c)
    const headers = { ETag: updated.etag, ...applied }
    return minimal ? new Response(null, { status: 204, headers }) : c.json({ ...updated.record, etag: updated.etag }, 200, headers)
  })

  app.delete('/:resource/:key', async (c) => {
    const { entry } = resolveTarget(deps, c.req.param('resource'))
    const deleted = await runWrite(deps, entry, c.get('session'), {
      operation: 'delete',
      key: keyFromPath(c, entry),
      ifMatch: c.req.header('if-match') ?? null,
    })
    const preference = c.req.header('prefer') ?? ''
    return /return=representation/.test(preference)
      ? c.json(deleted.record, 200, { 'Preference-Applied': 'return=representation' })
      : new Response(null, { status: 204 })
  })

  return app
}
