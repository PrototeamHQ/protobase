import type { Kysely } from 'kysely'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unauthorized } from '@protobase/server'
import { projectAdmin } from '../../src/project/project-admin'
import { createServeApp } from '../../src/serve/app'
import type { ServedProject } from '../../src/serve/load-bundle'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

const project: ServedProject = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

// A database the app never queries: an empty config's /meta reads no table.
let db: Kysely<any>
const html = { headers: { accept: 'text/html' } }

describe('createServeApp with a site', () => {
  let publicDir: string
  let app: ReturnType<typeof createServeApp>
  beforeAll(async () => {
    db = (await openSnapshotDb('empty')).db
    publicDir = await mkdtemp(path.join(tmpdir(), 'protobase-public-'))
    await mkdir(path.join(publicDir, 'assets'))
    await writeFile(path.join(publicDir, 'index.html'), '<title>admin</title>')
    await writeFile(path.join(publicDir, 'assets/app-1a2b.js'), 'export {}')
    app = createServeApp({ admin: projectAdmin(project, project.config, db).admin, requestLog: false, site: { publicDir, spa: 'index.html', api: ['/api'] } })
  })
  afterAll(async () => {
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
    // Where browsers read the origins that may use the app's passkeys.
    expect(await (await app.request('/.well-known/webauthn', html)).text()).not.toContain('<title>admin</title>')
  })

  it('keeps answering the health probe', async () => {
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' })
  })
})
