import type { ChannelSender } from '../channels/channel-sender'
import type { Db } from '@protobase/query'
import { invokeFunction, type ApiFunction, type FunctionCaller, type PublicFunctionContext } from '../functions/define-function'
import type { FunctionRecords } from '../functions/records'
import type { Session } from '../types'
import { retryAfterMs } from './retry-schedule'
import { standardWebhookHeaders } from './standard-webhooks'
import { subscriberSession } from './subscriber-view'
import { AddressRefusedError, pinnedRequest, type Resolve } from './table/pinned-request'
import type { SentOptions, SubscriptionDefinition, SubscriptionEvent } from './subscription'

/** How one try went. `final` failures are not tried again: the receiver said the endpoint is gone (`410`). */
export type AttemptResult = { ok: true; status?: number } | { ok: false; error: string; status?: number; retryAfterMs?: number; final: boolean }

/** What a try needs of the app. */
export type AttemptContext = {
  db: Db
  functions: Record<string, ApiFunction>
  records: (session: Session) => FunctionRecords
  channels: ChannelSender
  /** 1 for the first try. */
  attempt: number
  signal: AbortSignal
  /** Lets a URL target reach private, loopback and link-local addresses: config subscriptions, or `webhooks.allowPrivateAddresses`. */
  allowPrivateAddresses: boolean
  /** Resolves a URL target's host; default the system resolver. */
  resolve?: Resolve
}

/** How long a receiver has to answer. */
export const attemptTimeoutMs = 15_000

const excerpt = async (response: Response) => (await response.text()).slice(0, 200)

// 2xx is a success, anything else a failure: a redirect too, since a webhook is not followed elsewhere.
const resultOf = async (response: Response): Promise<AttemptResult> => {
  if (response.status >= 200 && response.status < 300) {
    await response.body?.cancel()
    return { ok: true, status: response.status }
  }
  const body = await excerpt(response)
  const wait = retryAfterMs(response.headers.get('retry-after'))
  return {
    ok: false,
    status: response.status,
    error: `${response.status}${body ? `: ${body}` : ''}`,
    ...(wait !== undefined && { retryAfterMs: wait }),
    final: response.status === 410,
  }
}

const delivery = async (event: SubscriptionEvent, options: SentOptions, signal: AbortSignal) => {
  const body = JSON.stringify(options.body ? options.body(event) : event)
  const signed = await standardWebhookHeaders(event.id, Math.floor(Date.now() / 1000), body, options.secret)
  return { method: 'POST', headers: new Headers({ ...options.headers, ...signed, 'content-type': 'application/json' }), body, signal }
}

// An API function is called in this process as the subscription's session, or as a caller without roles.
const callFunction = async (name: string, subscription: SubscriptionDefinition, event: SubscriptionEvent, options: SentOptions, context: AttemptContext, signal: AbortSignal) => {
  const fn = context.functions[name]
  if (!fn) throw new Error(`The app has no function "${name}"`)
  const session = subscriberSession(subscription) ?? { user: { id: `subscription:${subscription.name}`, roles: [] } }
  const caller: FunctionCaller = { session, records: context.records(session) }
  const noCalls = () => Promise.reject(new Error(`The function "${name}" reached calls, which a webhook delivery has none of`))
  const acceptWebSocket = () => {
    throw new Error(`The function "${name}" accepted a WebSocket, but a webhook delivery is no upgrade`)
  }
  const functionContext: PublicFunctionContext = { name, db: context.db, channels: context.channels, caller: async () => caller, acceptWebSocket, calls: { join: async () => acceptWebSocket(), remove: noCalls, of: noCalls } }
  return invokeFunction(name, fn, new Request('http://protobase.internal/', await delivery(event, options, signal)), fn.options.public ? functionContext : { ...functionContext, ...caller })
}

// A refused address is not tried again; any other error is.
const failure = (error: unknown): AttemptResult => ({ ok: false, error: error instanceof Error ? error.message : String(error), final: error instanceof AddressRefusedError })

/** One try of one event to one subscription's target, within `attemptTimeoutMs`. It never throws. */
export const attemptDelivery = async (subscription: SubscriptionDefinition, event: SubscriptionEvent, context: AttemptContext): Promise<AttemptResult> => {
  const signal = AbortSignal.any([context.signal, AbortSignal.timeout(attemptTimeoutMs)])
  const { options } = subscription
  try {
    if ('run' in options) {
      await options.run(event, { db: context.db, attempt: context.attempt, signal })
      return { ok: true }
    }
    if ('function' in options) return await resultOf(await callFunction(options.function, subscription, event, options, context, signal))
    const pinned = { allowPrivateAddresses: context.allowPrivateAddresses, ...(context.resolve && { resolve: context.resolve }) }
    return await resultOf(await pinnedRequest(options.url!, await delivery(event, options, signal), pinned))
  } catch (error) {
    return failure(error)
  }
}
