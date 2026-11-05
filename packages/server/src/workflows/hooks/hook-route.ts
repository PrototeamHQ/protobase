import { Hono } from 'hono'
import type { Db } from '@protobase/query'
import { webhookBodyCeiling, webhookBodyDefault, type WebhookTrigger } from '@protobase/workflows/plugin'
import type { FilesRuntime } from '../../files/runtime'
import { clientAddress, createRateLimit } from '../../forms/rate-limit'
import { badRequest, HttpProblem, notFound, problemResponse, unauthorized } from '../../problem'
import { callPlugin } from '../triggers/plugin-call'
import { itemCeiling, itemsProblem, runKeyLength } from '../triggers/poll-result'
import { removeRunFile, storeRunFile } from '../run-files'
import { authenticated, hmacOptions, idempotencyKey } from './hook-auth'
import { hookEvent, inlineBodyBytes, receivedRequest } from './hook-event'
import { webhookParams } from './hook-paths'
import { hookMode } from './hook-secrets'
import { findHook } from './hook-store'
import { startHookRuns } from './hook-runs'
import { readBody } from './read-body'

/** Calls an address may have refused (401, 404 and, once a URL was found, 400 and 413) a minute before it waits. */
const refusalsPerMinute = 30

/** Calls a minute that start runs, per trigger, when its input names no `per_minute`. */
const callsPerMinute = 60

export type HookRouteInput = {
  db: Db
  schema: string
  webhooks: (type: string) => WebhookTrigger | undefined
  webhookTypes: () => readonly string[]
  files: () => FilesRuntime | undefined
  /** Reports an error the route did not expect, without the request: its address holds the key. */
  report: (error: unknown) => void
  redact: (text: string) => string
}

const tooMany = (seconds: number, detail: string) => new HttpProblem(429, 'too-many-calls', 'Too Many Requests', detail, {}, { 'Retry-After': String(seconds) })

// The trigger's own body limit, never over 10 MiB whatever its input says.
const bodyLimit = (input: Record<string, unknown>) => Math.min(typeof input.body_limit === 'number' ? input.body_limit : webhookBodyDefault, webhookBodyCeiling)

/**
 * The public address a webhook trigger is called at, `POST .../workflows/hooks/<key>`, with no session: only POST; an
 * address that was refused 30 times this minute waits, before any lookup; the key must open a running webhook trigger
 * of an enabled version (404 for anything else, alike); the body is read up to the trigger's limit (413); the call
 * must prove it comes from the sender (401); then the trigger's own rate (429), spent only by calls that did; the run
 * starts once per signed id (202 `{ run_id }`). Each refusal starts no run. Its errors are its own: reported without
 * the request, answered with nothing of it.
 */
export const hookRoute = (input: HookRouteInput) => {
  const { db, schema } = input
  const refusals = createRateLimit()
  const calls = createRateLimit()
  const app = new Hono()

  app.onError((error) => {
    if (error instanceof HttpProblem) return problemResponse(error, '/workflows/hooks')
    input.report(error)
    return problemResponse(new HttpProblem(500, 'internal-error', 'Internal Server Error', 'The call could not be taken; send it again'), '/workflows/hooks')
  })

  app.all(`/:${webhookParams.key}`, async (c) => {
    if (c.req.method !== 'POST') return c.body(null, 405, { Allow: 'POST' })
    const request = c.req.raw
    const address = clientAddress(request.headers)
    const wait = refusals.spent(address, refusalsPerMinute)
    if (wait > 0) throw tooMany(wait, 'Too many refused calls from this address; wait a minute')
    // A refusal the address is charged for.
    const refused = (problem: HttpProblem) => {
      refusals.take(address, refusalsPerMinute)
      return problem
    }

    const target = await findHook(db, schema, c.req.param(webhookParams.key), input.webhookTypes())
    const type = target && input.webhooks(target.type)
    if (!target || !type) throw refused(notFound('There is no webhook at this address'))
    const bytes = await readBody(request, bodyLimit(target.input))
    if (!bytes) throw refused(new HttpProblem(413, 'body-too-large', 'Payload Too Large', `The body is over ${bodyLimit(target.input)} bytes, the most this webhook takes`))
    const mode = hookMode(target.input)
    const signed = new Request(request.url, { method: 'POST', headers: request.headers, body: bytes as BodyInit })
    if (!mode || !(await authenticated(signed, mode, target))) throw refused(unauthorized('The call does not carry this webhook\'s secret or signature'))

    const perMinute = typeof target.input.per_minute === 'number' ? target.input.per_minute : callsPerMinute
    const rate = calls.take(target.trigger_id, perMinute)
    if (rate > 0) throw tooMany(rate, `This webhook takes ${perMinute} calls a minute`)
    const key = idempotencyKey(request, mode, target.input)
    if (key !== undefined && key.length > runKeyLength) throw refused(badRequest('invalid-idempotency-key', `The call's id is over ${runKeyLength} characters`))

    // A body over the run input's limit is kept as a file of the run it starts, made under a run id chosen now.
    const runId = crypto.randomUUID()
    const signatureHeader = mode === 'hmac' ? hmacOptions(target.input).header : undefined
    const large = bytes.length > inlineBodyBytes
    if (large && !input.files()?.providers.private) throw refused(new HttpProblem(413, 'body-too-large', 'Payload Too Large', `The body is over ${inlineBodyBytes} bytes, and this app keeps no files for larger ones`))
    const file = large ? await storeRunFile(input.files(), runId, bytes, 'body', request.headers.get('content-type') ?? 'application/octet-stream') : undefined
    const event = hookEvent(request, bytes, signatureHeader, file)
    const received = await callPlugin(() => type.receive({ request: receivedRequest(request, bytes, signatureHeader), event, idempotencyKey: key, input: target.input }), input.redact)
    if (!('value' in received)) throw new Error(`The webhook trigger ${target.type} failed: ${'failed' in received ? received.failed : received.expired}`)
    const { items, response } = received.value
    const problem = itemsProblem(items, file ? 1 : itemCeiling, false)
    if (problem) throw new Error(`The webhook trigger ${target.type} ${problem}`)
    const ids = await startHookRuns(db, schema, target, items, runId)
    // The call's run was started before: the body kept for this one is not needed.
    if (file && ids[0] !== runId) await removeRunFile(input.files(), file)
    if (response) return response
    return ids.length === 1 ? c.json({ run_id: ids[0] }, 202) : c.json({ run_ids: ids }, 202)
  })

  return app
}
