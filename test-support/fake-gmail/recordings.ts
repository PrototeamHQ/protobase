import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginFetch } from '@protobase/workflows/plugin'
import type { GmailRecording } from '../../scripts/google-recording/google-calls'

// Gmail's answers recorded from the test account (`bun run record:google`), scrubbed of all but the test mail; each
// file is one call, by name.

/** The recorded calls. */
export const recordedCalls = ['profile', 'labels', 'history', 'messages', 'message-raw', 'message-metadata', 'message-not-found', 'unauthenticated'] as const

export type RecordedCall = (typeof recordedCalls)[number]

/** The recording of `name`; throws when there is none, so a test never runs without it. */
export const recording = (name: RecordedCall): GmailRecording => JSON.parse(readFileSync(join(import.meta.dirname, 'recordings', `${name}.json`), 'utf8')) as GmailRecording

/** The origin the recordings were made at, and the one `replayFetch` answers. */
export const recordedOrigin = 'https://gmail.googleapis.com'

const sameQuery = (query: URLSearchParams, recorded: [string, string][]) => query.toString() === new URLSearchParams(recorded).toString()

/**
 * The plugin context's `fetch`, answering only the recorded calls: a request of the recorded method, path and query
 * on `recordedOrigin` gets its recorded answer, and any other request throws, reaching no network. A request whose
 * bearer is not `token` gets the recorded 401, as Gmail's does.
 */
export const replayFetch = (token = 'token-1'): PluginFetch => {
  const recordings = recordedCalls.map(recording)
  return async (url, init = {}) => {
    const target = new URL(url)
    if (target.origin !== recordedOrigin) throw new Error(`No recording answers ${target.origin}`)
    const path = target.pathname.replace(/^\/gmail\/v1\/users\/me\//, '')
    const method = init.method ?? 'GET'
    const authorization = new Headers(init.headers).get('authorization')
    const found = authorization === `Bearer ${token}` ? recordings.find(({ request }) => request.method === method && request.path === path && sameQuery(target.searchParams, request.query)) : recording('unauthenticated')
    if (!found) throw new Error(`No recording answers ${method} ${path}?${target.searchParams}`)
    const { status, headers, body } = found.response
    return new Response(JSON.stringify(body), { status, headers })
  }
}
