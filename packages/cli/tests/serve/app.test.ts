import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unauthorized } from '@protobase/server'
import { createPgDb } from '../../src/project/pg-db'
import { createServeApp } from '../../src/serve/app'
import type { ServedProject } from '../../src/serve/load-bundle'

const project: ServedProject = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

// A pool that never connects: an empty config's /meta reads no table.
const db = createPgDb(pg, 'postgres://unused/app')
const html = { headers: { accept: 'text/html' } }

describe('createServeApp with a site', () => {
  let publicDir: string
  let app: ReturnType<typeof createServeApp>
  beforeAll(async () => {
    publicDir = await mkdtemp(path.join(tmpdir(), 'protobase-public-'))
    await mkdir(path.join(publicDir, 'assets'))
    await writeFile(path.join(publicDir, 'index.html'), '<title>admin</title>')
    await writeFile(path.join(publicDir, 'assets/app-1a2b.js'), 'export {}')
    app = createServeApp({ project, db, requestLog: false, site: { publicDir, spa: 'index.html', api: ['/api'] } })
  })
  afterAll(async () => {
    await db.destroy()
    await rm(publicDir, { recursive: true, force: true })
  })

  it('serves the UI for paths outside the api prefixes', async () => {
    expect(await (await app.request('/')).text()).toBe('<title>admin</title>')
    expect(await (await app.request('/orders/7', html)).text()).toBe('<title>admin</title>')
    expect((await app.request('/assets/app-1a2b.js')).headers.get('cache-control')).toContain('immutable')
    expect((await app.request('/assets/missing.js')).status).toBe(404)
  })

  it('sends the api prefixes to the API, navigations included', async () => {
    expect((await app.request('/api/meta', html)).status).toBe(401)
    expect((await app.request('/api/meta', { headers: { authorization: 'Bearer ok' } })).status).toBe(200)
    expect(await (await app.request('/api/nothing-here', html)).text()).not.toContain('<title>admin</title>')
  })

  it('keeps answering the health probe', async () => {
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' })
  })
})
