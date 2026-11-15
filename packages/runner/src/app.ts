import { createReadStream, createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { BuildReport, JobCompletion, RunnerOrder, RunnerState } from '@protobase/workflows'

/** A call the app refused, with its status and its problem's text. */
export class AppRefusal extends Error {
  constructor(
    readonly status: number,
    text: string,
  ) {
    super(`${status}: ${text.slice(0, 500)}`)
  }
}

/** How the runner reaches the app: `fetch`, the global one unless a test gives its own. */
export type Fetch = (url: string, init: RequestInit & { duplex?: 'half' }) => Promise<Response>

/** A stored file, as the app answers an upload. */
export type StoredFile = { configuration: string; node?: string; path: string; name: string; type: string; size: number }

const checked = async (response: Response) => {
  if (!response.ok) throw new AppRefusal(response.status, await response.text())
  return response
}

/** The app's runner API under `<url>/api/runners/v1`, every call but the registration with the runner's own token. */
export const appClient = ({ url, token, fetch = globalThis.fetch }: { url: string; token?: string; fetch?: Fetch }) => {
  const api = `${url}/api/runners/v1`
  const headers = { ...(token && { authorization: `Bearer ${token}` }) }
  const post = async (path: string, body: unknown, signal?: AbortSignal) =>
    (await checked(await fetch(`${api}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal && { signal }) }))).json() as Promise<unknown>
  return {
    register: (body: { token: string; platform: string; kinds: string[] }) => post('/register', body) as Promise<{ runner: { id: string; name: string; tenant: string | null }; token: string }>,
    /** Held open until the app answers with an order. */
    claim: (state: RunnerState, signal?: AbortSignal) => post('/claim', state, signal) as Promise<RunnerOrder>,
    heartbeat: (job: string) => post(`/jobs/${job}/heartbeat`, {}) as Promise<{ stop: boolean }>,
    log: (job: string, lines: string[]) => post(`/jobs/${job}/log`, { lines }),
    complete: (job: string, completion: JobCompletion) => post(`/jobs/${job}/complete`, completion),
    build: (report: BuildReport) => post('/builds', report) as Promise<{ id: string }>,
    /** Streams an input file from its job-scoped address, a path on the app, into `file`. */
    download: async (address: string, file: string, signal?: AbortSignal) => {
      const response = await checked(await fetch(new URL(address, url).href, { method: 'GET', headers, ...(signal && { signal }) }))
      if (!response.body) throw new Error(`${address} answered no body`)
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), createWriteStream(file, { mode: 0o644 }), ...(signal ? [{ signal }] : []))
    },
    /** Streams a file the container gave to the job's output address for `path`, answering the stored file. */
    upload: async (job: string, path: string, file: string, type: string, signal?: AbortSignal) => {
      const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
      const address = `${api}/jobs/${job}/outputs/${path.split('/').map(encodeURIComponent).join('/')}`
      const response = await checked(await fetch(address, { method: 'PUT', headers: { ...headers, 'content-type': type }, body, duplex: 'half', ...(signal && { signal }) }))
      return (await response.json()) as StoredFile
    },
  }
}

export type AppClient = ReturnType<typeof appClient>
