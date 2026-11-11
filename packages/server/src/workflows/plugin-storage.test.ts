import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
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

/** The size of the largest file a local store is still writing in `dir`, its `.tmp/`; 0 before it starts one. */
const largestWriting = async (dir: string) => {
  if (!existsSync(dir)) return 0
  const sizes = await Promise.all((await readdir(dir)).map(async (name) => (await stat(join(dir, name))).size))
  return Math.max(0, ...sizes)
}

describe('the storage steps and app:http with store, run through the plugin interface', () => {
  let server: Server
  let base: string
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime
  let requests = 0
  // How much of the big answer was on disk when half of it had been sent
  let writtenAtHalf = 0

  beforeAll(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: join(folder.dir, 'files', 'private') }) } } as unknown as FilesRuntime
    server = createServer((request, response) => {
      requests++
      if (request.url === '/big.bin') {
        // Generated as it is sent, chunked with no Content-Length, so neither side holds the whole body. Halfway it waits,
        // for 10 seconds at most, until the store has written a quarter: one that held the body would have written nothing.
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        const chunk = Buffer.alloc(mib, 7)
        let sent = 0
        const halfway = async () => {
          const writing = join(folder.dir, 'storage', 'archive', '.tmp')
          const until = Date.now() + 10_000
          while ((writtenAtHalf = await largestWriting(writing)) < bigSize / 4 && Date.now() < until) await sleep(10)
        }
        const more = () => {
          while (sent < bigSize) {
            if (sent === bigSize / 2 && writtenAtHalf === 0) return void halfway().then(more)
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
    list: async (_session, name) => [{ id: 'c1', name: 'archive', kind: 'local', dir: 'archive' }, { id: 'c2', name: 'bucket', kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint: 'https://storage.example.com' }].filter((row) => row.name === name),
    decrypt: () => async () => null,
    providerDirs: () => [join(folder.dir, 'files', 'private')],
    allowPrivateAddresses: true,
    node: 'node-1',
    environment: {},
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

  it('fails on a status outside 2xx without storing, and sends no request for store arguments, a configuration or a path it cannot store to', async () => {
    expect(await failure(step('app:http')({ url: `${base}/gone`, store: { configuration: 'archive', path: 'gone' } }, context()))).toEqual(['Http.Status', `${new URL(base).host} answered 404: no such file here`])
    const before = requests
    expect(await failure(step('app:http')({ url: base, store: { configuration: 'archive' }, response: 'text' }, context()))).toEqual(['Http.InvalidArguments', 'store keeps the body as a stored file: give no response with it'])
    expect(await failure(step('app:http')({ url: base, method: 'POST', body: { a: 1 }, store: { configuration: 'nowhere' } }, context()))).toEqual(['Storage.NotFound', 'No storage configuration "nowhere" this workflow may use'])
    expect((await failure(step('app:http')({ url: base, store: { configuration: 'bucket' } }, context())) as string[])[0]).toBe('Storage.Unavailable')
    expect((await failure(step('app:http')({ url: base, store: { configuration: 'archive', path: '../outside' } }, context())) as string[])[0]).toBe('Storage.InvalidArguments')
    expect(requests).toBe(before)
    expect(await failure(step('app:storage.get')({ file: { configuration: 'archive', path: 'missing.pdf', name: 'missing.pdf', type: 'application/pdf', size: 1 } }, context()))).toEqual(['Storage.NotFound', 'file names a file that is gone from "archive"'])
  })

  it('streams a 150 MB answer into a local configuration, writing it to disk while the rest still arrives', async () => {
    const result = (await step('app:http')({ url: `${base}/big.bin`, store: { configuration: 'archive', path: 'big.bin' } }, context())) as { body: { size: number } }
    expect(result.body.size).toBe(bigSize)
    expect(writtenAtHalf).toBeGreaterThanOrEqual(bigSize / 4)
  }, 60_000)
})
