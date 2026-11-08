import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { secretRedactor, StepError } from '@protobase/workflows'
import { appPlugin } from '@protobase/workflow-plugins'
import type { StepType } from '@protobase/workflows/plugin'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import type { Session } from '../types'
import { builtInStep } from './testing/built-in-step'
import { storageService } from './storage/plugin-storage'
import type { ConfigurationSources } from './storage/resolve-configuration'

const mib = 1024 * 1024
const bigSize = 150 * mib
const redactor = secretRedactor([])
const context = (runId = 'run-1', idempotencyKey = `${runId}//0`) => ({ runId, signal: new AbortController().signal, idempotencyKey, log: () => {}, redact: redactor.text, secret: redactor.add })
const session: Session = { user: { id: 'u1', roles: ['author'] } }
const writesFor = ({ writes }: StepType, input: Record<string, unknown>) => (typeof writes === 'function' ? writes(input) : writes)
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

describe('the storage steps and app:http with store, run through the plugin interface', () => {
  let server: Server
  let base: string
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime
  let requests = 0

  beforeAll(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: join(folder.dir, 'files', 'private') }) } } as unknown as FilesRuntime
    server = createServer((request, response) => {
      requests++
      if (request.url === '/big.bin') {
        // Generated as it is sent, chunked with no Content-Length, so neither side holds the whole body.
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        const chunk = Buffer.alloc(mib, 7)
        let sent = 0
        const more = () => {
          while (sent < bigSize) {
            sent += chunk.length
            if (!response.write(chunk)) return void response.once('drain', more)
          }
          response.end()
        }
        return more()
      }
      if (request.url === '/gone') return response.writeHead(404, { 'content-type': 'text/plain' }).end('no such file here')
      response.writeHead(200, { 'content-type': 'application/pdf; charset=binary' }).end('%PDF-1.4 report')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await folder.remove()
  })

  const sources = (): ConfigurationSources => ({
    storage: { root: join(folder.dir, 'storage'), endpoints: [] },
    list: async (_session, name) => (name === 'archive' ? [{ id: 'c1', name: 'archive', kind: 'local', dir: 'archive' }] : []),
    decrypt: () => async () => null,
    providerDirs: () => [join(folder.dir, 'files', 'private')],
    allowPrivateAddresses: true,
    node: 'node-1',
  })
  const step = (id: string) => builtInStep(id, { allowPrivateAddresses: true, files: () => files, storage: (runId) => storageService(async () => session, runId, sources()) })

  it('declares storing an answer a write, so a resumed run never fetches it again', () => {
    const http = appPlugin.steps!.http!
    expect(writesFor(http, { url: 'https://example.com/a' })).toBe(false)
    expect(writesFor(http, { url: 'https://example.com/a', store: { configuration: 'archive' } })).toBe(true)
    expect(writesFor(appPlugin.steps!['storage.put']!, {})).toBe(true)
    expect(writesFor(appPlugin.steps!['storage.get']!, {})).toBe(false)
  })

  it('streams an answer into storage and gives the stored file, which storage.get reads back as a file of the run', async () => {
    const result = (await step('app:http')({ url: `${base}/files/report.pdf`, store: { configuration: 'archive', path: 'in/report.pdf' } }, context())) as { status: number; body: unknown }
    expect(result).toMatchObject({ status: 200, body: { configuration: 'archive', node: 'node-1', path: 'in/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 15 } })
    const kept = await step('app:storage.get')({ file: result.body }, context())
    expect(kept).toMatchObject({ name: 'report.pdf', type: 'application/pdf', size: 15, uri: expect.stringMatching(/^private:workflows\/run-1\//) })
    const copy = await step('app:storage.put')({ configuration: 'archive', path: 'copy/report.pdf', file: kept }, context())
    expect(copy).toMatchObject({ configuration: 'archive', path: 'copy/report.pdf', size: 15 })
  })

  it('stores to a path of the step when given none, the same on a retry, so a crash before the checkpoint leaves one file', async () => {
    const first = (await step('app:http')({ url: `${base}/files/report.pdf`, store: { configuration: 'archive' } }, context('run-7', 'run-7//3'))) as { body: { path: string } }
    const again = (await step('app:http')({ url: `${base}/files/report.pdf`, store: { configuration: 'archive' } }, context('run-7', 'run-7//3'))) as { body: { path: string } }
    expect(first.body.path).toMatch(/^runs\/run-7\/[0-9a-f]{32}$/)
    expect(again.body.path).toBe(first.body.path)
    expect(await readdir(join(folder.dir, 'storage', 'archive', 'runs', 'run-7'))).toHaveLength(1)
  })

  it('fails on a status outside 2xx without storing, and on store arguments that make no request', async () => {
    expect(await failure(step('app:http')({ url: `${base}/gone`, store: { configuration: 'archive', path: 'gone' } }, context()))).toEqual(['Http.Status', `${new URL(base).host} answered 404: no such file here`])
    const before = requests
    expect(await failure(step('app:http')({ url: base, store: { configuration: 'archive' }, response: 'text' }, context()))).toEqual(['Http.InvalidArguments', 'store keeps the body as a stored file: give no response with it'])
    expect(await failure(step('app:http')({ url: base, store: { configuration: 'nowhere' } }, context()))).toEqual(['Storage.NotFound', 'No storage configuration "nowhere" this workflow may use'])
    expect(requests).toBe(before + 1)
    expect(await failure(step('app:storage.get')({ file: { configuration: 'archive', path: 'missing.pdf', name: 'missing.pdf', type: 'application/pdf', size: 1 } }, context()))).toEqual(['Storage.NotFound', 'file names a file that is gone from "archive"'])
  })

  it('streams a 150 MB answer into a local configuration while the heap stays far below its size', async () => {
    const gc = (globalThis as { gc?: () => void }).gc
    gc?.()
    const before = process.memoryUsage().heapUsed
    let peak = before
    const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed) }, 5)
    const result = (await step('app:http')({ url: `${base}/big.bin`, store: { configuration: 'archive', path: 'big.bin' } }, context())) as { body: { size: number } }
    clearInterval(sampler)
    expect(result.body.size).toBe(bigSize)
    // A fifth of the file: holding it, or any large part of it, would pass this whatever the collector's timing.
    expect(peak - before).toBeLessThan(bigSize / 5)
  }, 60_000)
})
