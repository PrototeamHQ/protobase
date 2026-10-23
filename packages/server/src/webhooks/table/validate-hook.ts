import type { ResourceModel } from '@protobase/schema'
import { badRequest } from '../../problem'
import type { PipelineHook, WriteCheck } from '../../types'
import { subscriptionProblems } from '../route-events'
import { parseEvents } from './options'

const isHeaders = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string'))

/**
 * Checks a webhook subscription as it is written: events that are declared, a filter that checks against every resource
 * it covers, and headers of text. A refusal is a 400 problem, and the write rolls back.
 */
export const subscriptionWriteCheck = (models: readonly ResourceModel[]): PipelineHook => async (event) => {
  if (event.resource.name !== 'webhook_subscriptions' || !event.after) return
  const { events, url, filter, headers } = event.after as { events: string; url: string; filter?: string | null; headers?: unknown }
  const candidate = { kind: 'subscription', name: 'it', options: { events: parseEvents(events), url, ...(filter && { when: filter }) } } as const
  const problems = [
    ...(parseEvents(events).length === 0 ? ['names no events'] : []),
    ...subscriptionProblems([candidate], models, []).map((problem) => problem.replace('Subscription "it" ', '')),
    ...(isHeaders(headers) ? [] : ['headers must be an object of text values']),
  ]
  if (problems.length > 0) throw badRequest('invalid-webhook-subscription', `The webhook subscription cannot be saved: ${problems.join('; ')}`)
}

/**
 * Checks the URL a webhook subscription is given before its write's transaction opens, since that resolves its host:
 * it must be at a public address. A URL that does not parse is left to `subscriptionWriteCheck`.
 */
export const subscriptionUrlCheck = (checkUrl: (url: string) => Promise<string | undefined>): WriteCheck => async ({ resource, body }) => {
  if (resource !== 'webhook_subscriptions' || typeof body !== 'object' || body === null) return
  const { url } = body as { url?: unknown }
  if (typeof url !== 'string' || !URL.canParse(url)) return
  const blocked = await checkUrl(url)
  if (blocked) throw badRequest('invalid-webhook-subscription', `The webhook subscription cannot be saved: ${blocked}`)
}
