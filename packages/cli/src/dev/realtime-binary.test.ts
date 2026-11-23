import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { realtimeBinary } from './realtime-binary'

const asset = 'protobase-realtime-linux-amd64'
const binary = Buffer.from('#!/bin/sh\necho realtime\n')
const release = { version: '0.1.0', sha256: { [asset]: createHash('sha256').update(binary).digest('hex') } }

describe('realtimeBinary', () => {
  let cacheDir: string
  let server: Server
  let requests: string[]
  // What the fake release serves for its asset.
  let served: Buffer
  let env: NodeJS.ProcessEnv
  const resolve = (options = {}) => realtimeBinary({ env, release, cacheDir, platform: 'linux', arch: 'x64', ...options })
  const cached = path.join('0.1.0', asset)

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'protobase-realtime-cache-'))
    requests = []
    served = binary
    server = createServer((request, response) => {
      requests.push(request.url!)
      if (request.url !== `/v0.1.0/${asset}`) return void response.writeHead(404).end()
      response.end(served)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    env = { PROTOBASE_REALTIME_DOWNLOAD_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
  })

  afterEach(async () => {
    server.close()
    await rm(cacheDir, { recursive: true, force: true })
  })

  it("downloads the pinned version's asset on first use, executable, and takes it from the cache after", async () => {
    const file = await resolve()
    expect(file).toBe(path.join(cacheDir, cached))
    expect(await readFile(file)).toEqual(binary)
    expect((await stat(file)).mode & 0o111).toBe(0o111)
    expect(await resolve()).toBe(file)
    expect(requests).toEqual([`/v0.1.0/${asset}`])
  })

  it('fails on an asset whose sha256 is not the pinned one, and caches nothing', async () => {
    served = Buffer.from('tampered')
    await expect(resolve()).rejects.toThrow(/Protobase Realtime from http:\/\/127\.0\.0\.1:\d+\/v0\.1\.0\/protobase-realtime-linux-amd64 has sha256 [0-9a-f]{64}, not the pinned/)
    expect(await readdir(cacheDir)).toEqual([])
  })

  it('replaces a cached binary that no longer matches', async () => {
    const file = await resolve()
    await writeFile(file, 'changed')
    expect(await resolve()).toBe(file)
    expect(await readFile(file)).toEqual(binary)
    expect(requests).toHaveLength(2)
    expect(await readdir(path.dirname(file))).toEqual([asset])
  })

  it("never takes another version's cache", async () => {
    await resolve()
    const next = { version: '0.2.0', sha256: release.sha256 }
    await expect(resolve({ release: next })).rejects.toThrow(/could not download Protobase Realtime from http:\/\/127\.0\.0\.1:\d+\/v0\.2\.0\/protobase-realtime-linux-amd64 \(HTTP 404\): check the connection, or set PROTOBASE_REALTIME_BINARY/)
  })

  it('names the address and PROTOBASE_REALTIME_BINARY when nothing answers', async () => {
    env = { PROTOBASE_REALTIME_DOWNLOAD_URL: 'http://127.0.0.1:1' }
    await expect(resolve()).rejects.toThrow('could not download Protobase Realtime from http://127.0.0.1:1/v0.1.0/protobase-realtime-linux-amd64 (no connection): check the connection, or set PROTOBASE_REALTIME_BINARY to a binary of your own')
  })

  it('takes PROTOBASE_REALTIME_BINARY as it is, downloading nothing', async () => {
    env = { ...env, PROTOBASE_REALTIME_BINARY: '/opt/realtime/bin/protobase-realtime' }
    expect(await resolve({ platform: 'freebsd' })).toBe('/opt/realtime/bin/protobase-realtime')
    expect(requests).toEqual([])
  })

  it('fails on a machine the release has no build for', async () => {
    await expect(resolve({ platform: 'freebsd' })).rejects.toThrow('Protobase Realtime 0.1.0 has no build for freebsd-x64: set PROTOBASE_REALTIME_BINARY to a binary of your own, or set realtime.relay.url to a running relay')
    await expect(resolve({ platform: 'win32', arch: 'arm64' })).rejects.toThrow('has no build for win32-arm64')
    expect(requests).toEqual([])
  })
})
