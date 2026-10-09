import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveStaticSite, type StaticSite } from './static-site'

const page = (pathname: string, init: RequestInit = {}) => new Request(`http://local${pathname}`, init)
const navigation = (pathname: string) => page(pathname, { headers: { accept: 'text/html,application/xhtml+xml' } })

describe('serveStaticSite', () => {
  let site: StaticSite
  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'protobase-site-'))
    await writeFile(path.join(root, 'secret.txt'), 'outside')
    const publicDir = path.join(root, 'public')
    await mkdir(path.join(publicDir, 'assets'), { recursive: true })
    await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>app</title>')
    await writeFile(path.join(publicDir, 'assets/index-abc123.js'), 'console.log(1)')
    site = { publicDir, spa: 'index.html' }
  })
  afterAll(() => rm(path.dirname(site.publicDir), { recursive: true, force: true }))

  it('serves a hashed asset as immutable and index.html as revalidated', async () => {
    const asset = await serveStaticSite(site, page('/assets/index-abc123.js'))
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await asset.text()).toBe('console.log(1)')

    const index = await serveStaticSite(site, page('/'))
    expect(index.headers.get('content-type')).toContain('text/html')
    expect(index.headers.get('cache-control')).toBe('no-cache')
    expect(await index.text()).toContain('<title>app</title>')
  })

  it('answers a navigation to a path that is no file with the SPA page', async () => {
    const deep = await serveStaticSite(site, navigation('/orders/42'))
    expect(deep.status).toBe(200)
    expect(await deep.text()).toContain('<title>app</title>')
  })

  it('answers 404 for a missing file that is not a navigation', async () => {
    expect((await serveStaticSite(site, page('/assets/gone.js'))).status).toBe(404)
  })

  it('never serves a file outside the public folder', async () => {
    for (const pathname of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '/%E0%A4%A']) {
      const response = await serveStaticSite(site, page(pathname))
      expect(response.status).toBe(404)
    }
  })

  it('refuses methods other than GET and HEAD', async () => {
    const response = await serveStaticSite(site, page('/', { method: 'POST' }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })
})
