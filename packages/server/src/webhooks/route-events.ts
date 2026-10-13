import { evaluateFilter, type CheckedFilter, type ResourceModel } from '@protobase/schema'
import { checkEventFilter } from '@protobase/schema/internal'
import type { ResourceChange } from '../changes/resource-change'
import { eventPatternMatches, type SubscriptionDefinition } from './subscription'

/** One event of a change that one subscription takes. */
export type Route = { subscription: SubscriptionDefinition; event: string }

const declaredEvents = (models: readonly ResourceModel[]) => models.flatMap((model) => (model.events ?? []).map((event) => ({ model, name: event.name })))

// The resources whose events a subscription names.
const coveredModels = (subscription: SubscriptionDefinition, models: readonly ResourceModel[]) => {
  const events = declaredEvents(models).filter(({ name }) => subscription.options.events.some((pattern) => eventPatternMatches(pattern, name)))
  return [...new Set(events.map(({ model }) => model))]
}

/**
 * What is wrong with the subscriptions, given the resources and the app's API functions: a pattern that names no
 * declared event, a `when` that does not check against a resource it covers, a missing function or URL, roles left
 * empty. Disabled subscriptions are checked too, except for their URL.
 */
export const subscriptionProblems = (subscriptions: readonly SubscriptionDefinition[], models: readonly ResourceModel[], functions: readonly string[]) =>
  subscriptions.flatMap((subscription) => {
    const { name, options } = subscription
    const declared = declaredEvents(models).map((event) => event.name)
    const problems = [
      ...options.events.filter((pattern) => !declared.some((event) => eventPatternMatches(pattern, event))).map((pattern) => `"${pattern}" matches no declared event`),
      ...(options.when === undefined
        ? []
        : coveredModels(subscription, models).flatMap((model) => {
            const { problem } = checkEventFilter(model, options.when!)
            return problem ? [`when ${problem} on ${model.name}`] : []
          })),
      ...('function' in options && !functions.includes(options.function) ? [`calls the function "${options.function}", which the app does not have`] : []),
      ...('url' in options && options.enabled !== false && !options.url ? ['has an empty url; is its environment variable set?'] : []),
      ...(options.as && options.as.roles.length === 0 ? ['delivers as no roles'] : []),
    ]
    return problems.map((problem) => `Subscription "${name}" ${problem}`)
  })

/**
 * Which subscriptions take which of a change's events: enabled, naming the event, of the change's tenant when they set
 * one, and passing their `when` on the record after the change (before it, for a delete). Filters are checked once,
 * here; run `subscriptionProblems` first.
 */
export const subscriptionRouter = (subscriptions: readonly SubscriptionDefinition[], models: readonly ResourceModel[]) => {
  const filters = new Map<string, CheckedFilter>()
  for (const subscription of subscriptions) {
    if (subscription.options.when === undefined) continue
    for (const model of coveredModels(subscription, models)) {
      const { filter } = checkEventFilter(model, subscription.options.when)
      if (filter) filters.set(`${subscription.name}\0${model.name}`, filter)
    }
  }
  const passes = (subscription: SubscriptionDefinition, change: ResourceChange) => {
    const { options } = subscription
    if (options.enabled === false) return false
    if (options.tenant !== undefined && String(options.tenant) !== String(change.tenant)) return false
    const filter = filters.get(`${subscription.name}\0${change.resource}`)
    return !filter || evaluateFilter(filter, change.after ?? change.before) === true
  }
  return (change: ResourceChange, events: readonly string[]): Route[] =>
    subscriptions.flatMap((subscription) => {
      if (!passes(subscription, change)) return []
      return events.filter((event) => subscription.options.events.some((pattern) => eventPatternMatches(pattern, event))).map((event) => ({ subscription, event }))
    })
}
