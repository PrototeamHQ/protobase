import { checkEventFilter, evaluateFilter, type CheckedFilter, type EventContext, type EventMatch, type EventModel, type ResourceModel } from '@protobase/schema'
import type { ResourceChange } from './resource-change'

type Test = (change: ResourceChange) => boolean

const filterOf = (model: ResourceModel, source: string) => {
  const { filter, problem } = checkEventFilter(model, source)
  if (!filter) throw new Error(`Resource "${model.name}": event filter "${source}" ${problem}`)
  return filter
}

const holds = (filter: CheckedFilter, record: unknown) => record !== undefined && evaluateFilter(filter, record) === true

const contextOf = (change: ResourceChange): EventContext => ({
  operation: change.operation,
  ...(change.before && { before: change.before }),
  ...(change.after && { after: change.after }),
  changed: change.changed,
  actor: change.actor,
  source: change.source,
  ...(change.tenant !== undefined && { tenant: change.tenant }),
  transaction: change.transaction,
})

// Every condition the event sets, ANDed.
const eventTest = (model: ResourceModel, event: EventModel, match: EventMatch<any> | undefined): Test => {
  const tests: Test[] = [(change) => event.operations.includes(change.operation)]
  if (event.when !== undefined) {
    const when = filterOf(model, event.when)
    tests.push((change) => holds(when, change.after))
  }
  if (event.from !== undefined) {
    const from = filterOf(model, event.from)
    tests.push((change) => holds(from, change.before))
  }
  if (event.becomes !== undefined) {
    const condition = filterOf(model, event.becomes)
    tests.push((change) => holds(condition, change.after) && !holds(condition, change.before))
  }
  if (event.changed) {
    const fields = event.changed
    tests.push((change) => change.changed.some((name) => fields.includes(name)))
  }
  if (event.match) {
    if (!match) throw new Error(`Resource "${model.name}": event "${event.name}" has no match function`)
    tests.push((change) => match(contextOf(change)))
  }
  return (change) => tests.every((test) => test(change))
}

/**
 * The names of the resource's events a change raises, in declaration order. The filters are checked once, here; `matches`
 * are the events' code predicates by event name (`eventMatches()` of the resource).
 */
export const eventMatcher = (model: ResourceModel, matches: Record<string, EventMatch<any>> = {}) => {
  const tests = (model.events ?? []).map((event) => ({ name: event.name, test: eventTest(model, event, matches[event.name]) }))
  return (change: ResourceChange) => tests.filter(({ test }) => test(change)).map(({ name }) => name)
}
