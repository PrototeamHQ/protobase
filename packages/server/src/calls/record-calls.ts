import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { encodeKey } from '@protobase/schema/internal'
import { anonymousUserId } from '../anonymous'
import { readableRecord } from '../comments/comment-access'
import type { Deps } from '../deps'
import { forbidden, HttpProblem, notFound } from '../problem'
import type { Entry } from '../registry'
import { requestAccess, requireOperation } from '../request-access'
import { readTransaction } from '../transactions'
import type { AdminEnv, Session } from '../types'
import type { CallItem } from './call-reads'

/** How often a page that follows a record's calls is checked again: whether its user still reads the record. */
const recheckMs = 60_000
const heartbeatMs = 25_000

/**
 * Whether the caller may see the record's calls: signed in, and able to read the record (operation, tenant, row filter
 * and record-level rule, as a get). A record they cannot read is the same 404 as one that does not exist.
 */
const requireReader = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[]) => {
  if (session.anonymous || session.user.id === anonymousUserId) throw forbidden('calls-need-user', 'Sign in to see the calls')
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => readableRecord(trx, access, key, 'hide'))
  if (!found) throw notFound(`No ${entry.name} with this key`)
}

const callsOf = (deps: Deps) => {
  if (!deps.calls) throw notFound('This app has no calls')
  return deps.calls
}

/** `GET /{resource}/{key}:calls`: the record's latest calls, newest first, the one going on first. */
export const readRecordCalls = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[]) => {
  const calls = callsOf(deps)
  await requireReader(deps, entry, session, key)
  const runtime = await calls.runtime()
  return { items: await runtime.of({ resource: entry.name, key: encodeKey(key) }) }
}

/**
 * `GET /{resource}/{key}:calls?watch=true`: the same as a `text/event-stream`, each event's data `{ items }`, at once
 * and whenever the calls change. The stream ends once its user can no longer read the record, at the next minute's
 * check, or when the check fails.
 */
export const watchRecordCalls = async (c: Context<AdminEnv>, deps: Deps, entry: Entry, key: (string | number)[]) => {
  const calls = callsOf(deps)
  const session = c.get('session')
  await requireReader(deps, entry, session, key)
  const runtime = await calls.runtime()
  return streamSSE(c, async (stream) => {
    const queue: CallItem[][] = []
    let wake = () => {}
    let allowed = true
    stream.onAbort(() => wake())
    const stop = await runtime.watch({ resource: entry.name, key: encodeKey(key) }, (items) => {
      queue.push(items)
      wake()
    })
    const recheck = setInterval(() => {
      // A refusal ends the stream; so does any other failure, reported, so an outage never leaves it open unchecked.
      requireReader(deps, entry, session, key).catch((error: unknown) => {
        if (!(error instanceof HttpProblem)) deps.report(error)
        allowed = false
        wake()
      })
    }, recheckMs)
    // A comment line, which readers skip, so proxies keep the stream open.
    const heartbeat = setInterval(() => void stream.write(': ping\n\n'), heartbeatMs)
    try {
      while (!stream.aborted && allowed) {
        const items = queue.shift()
        if (items) await stream.writeSSE({ data: JSON.stringify({ items }) })
        else await new Promise<void>((resolve) => (wake = resolve))
      }
    } finally {
      clearInterval(recheck)
      clearInterval(heartbeat)
      stop()
    }
  })
}
