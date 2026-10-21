import { checkRecord, evaluateFilter, type ResourceModel } from '@protobase/schema'
import { EventCodeError } from '../changes/event-code-error'
import type { ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import { requestAccess, type RequestAccess } from '../request-access'
import type { Row, Session } from '../types'
import type { SubscriptionDefinition, SubscriptionEvent } from './subscription'

/**
 * The session a subscription delivers as, or `undefined` for the system: every record, every field but sensitive ones.
 * Its tenant is the change's, typed as the app's, when the subscription has one.
 */
export const subscriberSession = ({ name, options }: SubscriptionDefinition, change?: ResourceChange): Session | undefined => {
  if (!options.as) return undefined
  const tenant = options.tenant === undefined ? undefined : (change?.tenant ?? options.tenant)
  return { user: { id: `subscription:${name}`, roles: options.as.roles }, ...(tenant !== undefined && { tenant, organization: { id: tenant } }) }
}

const pick = (record: Row, fields?: readonly string[]) => (fields ? Object.fromEntries(Object.entries(record).filter(([name]) => fields.includes(name))) : record)

/** A change's event as a subscriber sees it: only `fields` of its records (all without), none at all when `thin`. */
export const subscriptionEvent = (change: ResourceChange, event: string, { fields, thin = false }: { fields?: readonly string[]; thin?: boolean } = {}): SubscriptionEvent => ({
  id: `evt_${change.sequence}_${event.slice(event.indexOf('.') + 1)}`,
  type: event,
  timestamp: change.at,
  data: {
    resource: change.resource,
    operation: change.operation,
    key: change.key,
    sequence: change.sequence,
    ...(!thin && change.after && { after: pick(change.after, fields) }),
    ...(!thin && change.before && { before: pick(change.before, fields) }),
    changed: fields ? change.changed.filter((name) => fields.includes(name)) : change.changed,
    ...(change.tenant !== undefined && { tenant: change.tenant }),
    actor: change.actor,
    source: change.source,
    transaction: change.transaction,
  },
})

// A captured record holds no sensitive field, nor one captured before it had a column, so whether one is set is unknown
// here: a rule that reads one throws, and the change is kept as failed, rather than deciding as if the field were empty.
// The read is remembered too, so a rule that catches the throw still fails.
const withUnknownFields = (model: ResourceModel, record: Row) => {
  const fields = Object.values(model.fields).filter((field) => field.sensitive || !Object.hasOwn(record, field.name))
  const unknown = { ...record }
  const read: string[] = []
  const error = (name: string) => {
    const field = model.fields[name]!
    return new Error(`a subscription's access check cannot tell whether the ${field.sensitive ? 'sensitive field' : 'field'} "${name}" is set${field.sensitive ? '' : ', which the captured change does not hold'}`)
  }
  for (const field of fields) {
    Object.defineProperty(unknown, field.name, {
      enumerable: true,
      get: () => {
        read.push(field.name)
        throw error(field.name)
      },
    })
  }
  const check = () => {
    if (read.length > 0) throw error(read[0]!)
  }
  return { record: unknown, check }
}

// Whether the session may read the record: the operation, its row filter and a rule that needs the record.
const decide = async (access: RequestAccess, record: Row) => {
  const { resolved, session, entry } = access
  if (!resolved.operations.read) return false
  if (resolved.rowFilter.read && evaluateFilter(resolved.rowFilter.read, record) !== true) return false
  if (!resolved.recordChecks.includes('read')) return true
  const context = { user: session.user, ...(session.organization && { organization: session.organization }) }
  return checkRecord(entry.source, context, 'read', record, undefined, access.deps.accessOptions)
}

const mayRead = async (access: RequestAccess, captured: Row) => {
  const { record, check } = withUnknownFields(access.full, captured)
  const allowed = await decide(access, record)
  check()
  return allowed
}

/**
 * Builds each subscriber's event, under the access rules of the session it delivers as, resolved once per subscription
 * and resource: `undefined` when it may not read the record, after the change or before a delete.
 */
export const subscriberEvents = (deps: Deps) => {
  const accesses = new Map<string, Promise<RequestAccess>>()
  return async (subscription: SubscriptionDefinition, change: ResourceChange, event: string) => {
    const thin = subscription.options.payload === 'thin'
    const session = subscriberSession(subscription, change)
    if (!session) return subscriptionEvent(change, event, { thin })
    const entry = deps.registry.find(change.resource)
    if (!entry) throw new Error(`Not implemented: a change of "${change.resource}", which is no resource of the app`)
    const cacheKey = `${subscription.name}\0${change.resource}`
    if (!accesses.has(cacheKey)) accesses.set(cacheKey, requestAccess(deps, entry, session))
    const readable = async () => {
      const access = await accesses.get(cacheKey)!
      return (await mayRead(access, (change.after ?? change.before)!)) ? access : undefined
    }
    // The access rules are the app's code.
    const access = await readable().catch((error: unknown) => {
      throw new EventCodeError(`The access check of subscription "${subscription.name}" on ${change.resource} ${change.key}`, error)
    })
    if (!access) return undefined
    return subscriptionEvent(change, event, { fields: Object.keys(access.readable.fields), thin })
  }
}
