import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { localFileStore, objectKey } from '@protobase/server'
import { copyObject } from './storage-copy'
import { objectUrl, supabaseDownload } from './storage-download'
import { storageReport } from './storage-report'

describe('objectUrl', () => {
  it("addresses the object under the project's Storage API, each segment of the name encoded", () => {
    expect(objectUrl('https://abc.supabase.co/', 'avatars', 'users/1/my photo #1.png')).toBe('https://abc.supabase.co/storage/v1/object/authenticated/avatars/users/1/my%20photo%20%231.png')
  })
})

const key = 'sk-TEST-SECRET'
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

// An http server on 127.0.0.1 that records the headers of each request and counts its connections.
const listen = async (handler: RequestListener) => {
  const requests: IncomingHttpHeaders[] = []
  const counted = { connections: 0 }
  const server: Server = createServer((request, response) => {
    requests.push(request.headers)
    handler(request, response)
  })
  server.on('connection', () => counted.connections++)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise((resolve) => server.close(resolve)))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests, counted }
}

const dir = async () => {
  const created = await mkdtemp(path.join(tmpdir(), 'protobase-storage-download-'))
  cleanups.push(() => rm(created, { recursive: true, force: true }))
  return created
}

const hello = 'hello'
const object = (name: string) => ({ bucket: 'avatars', name, version: `v-${name}`, size: 5, eTag: '"5d41402abc4b2a76b9719d911017c592"' })

describe('supabaseDownload', () => {
  it('does not follow a redirect to another host, so the key never reaches it and the object fails with the status', async () => {
    const other = await listen((_, response) => response.end('not the object'))
    const source = await listen((request, response) => {
      if (request.url?.endsWith('/one.png')) return response.writeHead(302, { location: `${other.url}/one.png` }).end()
      if (request.url?.endsWith('/two.png')) return response.writeHead(303, { location: `${other.url}/two.png`, 'content-type': 'text/html' }).end('<a href="elsewhere">moved</a>')
      response.end(hello)
    })
    const store = localFileStore(await dir())
    const objects = ['one.png', 'two.png', 'three.png'].map(object)

    const download = supabaseDownload({ url: source.url, key })
    const outcomes = []
    for (const item of objects) outcomes.push(await copyObject(download, store, item))

    expect(other.counted.connections).toBe(0)
    expect(outcomes.map((outcome) => outcome.fault)).toEqual(['Supabase answered 302', 'Supabase answered 303', undefined])
    const stored = await Promise.all(objects.map(async (item) => (await store.head(await objectKey(item.bucket, item.name, item.version)))?.size))
    expect(stored).toEqual([undefined, undefined, 5])
    const report = storageReport(source.url, 'local', objects, outcomes)
    expect(report).toContain('| avatars | one.png | Supabase answered 302 |')
    expect(report).toContain('| avatars | two.png | Supabase answered 303 |')
    expect(report).not.toContain(key)
    expect(report).not.toContain(other.url.replace('http://', ''))

    // The control: fetch's default follows the redirect and sends the key on in `apikey`, which this guards against.
    await (await fetch(objectUrl(source.url, 'avatars', 'one.png'), { headers: { apikey: key, authorization: `Bearer ${key}` } })).text()
    expect(other.requests).toEqual([expect.objectContaining({ apikey: key })])
  })

  it.each([302, 307])('does not follow a %d to another path on the same host either', async (status) => {
    const source = await listen((_, response) => response.writeHead(status, { location: '/storage/v1/object/other' }).end())
    const store = localFileStore(await dir())
    const item = object('a.png')

    const response = await supabaseDownload({ url: source.url, key })('avatars', 'a.png')
    await response.body?.cancel()
    expect(response.status).toBe(status)
    expect(source.requests).toHaveLength(1)

    const outcome = await copyObject(supabaseDownload({ url: source.url, key }), store, item)
    expect(storageReport(source.url, 'local', [item], [outcome])).toContain(`| avatars | a.png | Supabase answered ${status} |`)
    expect(source.requests).toHaveLength(2)
  })
})
