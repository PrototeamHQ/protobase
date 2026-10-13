import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import type { FunctionRecords } from '../functions/records'
import { HttpProblem } from '../problem'
import type { Row, Session, TenantValue } from '../types'
import { subscriberSession } from './subscriber-view'
import { eventPatternMatches, type SubscriptionDefinition, type SubscriptionEvent } from './subscription'

/**
 * What Send test event sends: the first declared event the subscription takes, made up from the newest record of its
 * resource that the subscription may read, or with no record when it may read none. It is marked `test`.
 */
export const testEvent = async (deps: Deps, records: (session: Session) => FunctionRecords, subscription: SubscriptionDefinition): Promise<SubscriptionEvent> => {
  const { options } = subscription
  const declared = deps.registry.entries.flatMap((entry) => (entry.model.events ?? []).map((event) => ({ entry, name: event.name })))
  const found = declared.find(({ name }) => options.events.some((pattern) => eventPatternMatches(pattern, name)))
  if (!found) throw new Error(`The subscription "${subscription.name}" takes no declared event`)
  const { entry, name } = found
  const session = subscriberSession(subscription) ?? { user: { id: `subscription:${subscription.name}`, roles: [] } }
  // A subscription that may not list the resource gets the event without a record.
  const page = await records(session)
    .list(entry.name, { page_size: 1 })
    .catch((error: unknown) => {
      if (error instanceof HttpProblem) return undefined
      throw error
    })
  const item = page?.items[0]
  const record = item && (Object.fromEntries(Object.entries(item).filter(([field]) => Object.hasOwn(entry.model.fields, field))) as Row)
  const thin = options.payload === 'thin'
  const tenant = entry.model.tenant && record ? (record[entry.model.tenant] as TenantValue | undefined) : undefined
  return {
    id: `test_${crypto.randomUUID()}`,
    type: name,
    timestamp: new Date().toISOString(),
    data: {
      resource: entry.name,
      operation: 'create',
      key: record ? encodeKey(entry.model.primaryKey.map((field) => record[field] as KeyValue)) : '',
      sequence: '0',
      ...(record && !thin && { after: record }),
      changed: [],
      ...(tenant !== undefined && tenant !== null && { tenant }),
      actor: null,
      source: 'database',
      transaction: '0',
    },
    test: true,
  }
}
