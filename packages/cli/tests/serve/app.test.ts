import type { Kysely } from 'kysely'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unauthorized } from '@protobase/server'
import { projectAdmin } from '../../src/project/project-admin'
import { createServeApp } from '../../src/serve/app'
import { servedRelease } from '../../src/serve/mobile-release'
import { nativeFingerprint } from '../../src/mobile/fingerprint'
import type { BuiltProject } from '../../src/config/build-project'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

const project: BuiltProject = {
  config: {},
  jobs: [],
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
    app = createServeApp({ admin: projectAdmin(project, db).admin, requestLog: false, site: { publicDir, spa: 'index.html', api: ['/api'] } })
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

describe('createServeApp with a mobile section', () => {
  let publicDir: string
  beforeAll(async () => {
    publicDir = await mkdtemp(path.join(tmpdir(), 'protobase-public-'))
    await mkdir(path.join(publicDir, 'assets'))
    await writeFile(path.join(publicDir, 'index.html'), '<head><title>admin</title></head>')
    await writeFile(path.join(publicDir, 'assets/app-1a2b.js'), 'export {}')
  })
  afterAll(() => rm(publicDir, { recursive: true, force: true }))

  it("serves the site's files to the updater, its page naming the API origin, each file with its checksum", async () => {
    const native = { '@capacitor/core': '8.5.3' }
    const site = { publicDir, spa: 'index.html', api: ['/api'], native }
    const release = await servedRelease({ site, mobile: { appId: 'com.example.shop' }, issuer: 'https://shop.example.com' })
    const app = createServeApp({ admin: projectAdmin(project, db).admin, requestLog: false, site, mobile: { ...(release && { release }), serverVersion: '0.14.2' } })
    const answer = await (await app.request(`/api/mobile/release?fingerprint=${nativeFingerprint(native)}&shell_version=0.14.2`)).json()
    expect(answer).toEqual({ bundleId: release?.bundleId, url: `https://shop.example.com/api/mobile/releases/${release?.bundleId}`, required: false })

    const file = async (href: string) => {
      const response = await app.request(`/api/mobile/releases/${answer.bundleId}?href=${href}`)
      const body = Buffer.from(await response.arrayBuffer())
      expect(response.headers.get('x-checksum')).toBe(createHash('sha256').update(body).digest('hex'))
      return body.toString()
    }
    expect(JSON.parse(await file('capawesome-live-update-manifest.json')).map((item: { href: string }) => item.href)).toEqual(['assets/app-1a2b.js', 'index.html'])
    expect(await file('index.html')).toBe('<head><title>admin</title><meta name="protobase-api-origin" content="https://shop.example.com"></head>')
  })
})
