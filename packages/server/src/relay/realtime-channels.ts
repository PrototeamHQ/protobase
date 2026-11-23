import type { ResourceModel, ViewModel } from '@protobase/schema'
import { capturedBy } from '../changes/capture-sql'
import type { RealtimeRelayOptions, RelayChannelOptions } from './relay-options'
import { listedFieldProblem } from './relay-models'

/** What the relay's channels are derived from: the app's views and resources, and whether it has its own sign-in. */
export type RelayApp = { views: readonly ViewModel[]; models: readonly ResourceModel[]; signIn: boolean }

/**
 * The relay's channels an app gets without declaring them: one for each resource whose conversation page has
 * `members`, a JSON field of user ids on the record, with that field as its members, when its changes are captured,
 * such as with `.live()`, so the relay hears who joins and leaves, its key is one field and the field's changes are
 * captured (`listedFieldProblem`). A page without `members` gives none, as a channel without members would be open.
 * Views of one resource that list members in different fields stop it: the channel takes one.
 */
export const defaultRelayChannels = ({ views, models }: Pick<RelayApp, 'views' | 'models'>): Record<string, RelayChannelOptions> => {
  const captured = capturedBy(models)
  const byName = new Map(models.map((model) => [model.name, model]))
  const fields = new Map<string, string>()
  for (const view of views) {
    const page = view.record
    if (!page || !('conversation' in page) || page.conversation.members === undefined) continue
    const model = byName.get(view.resource)
    if (!model || !captured(model) || model.primaryKey.length !== 1 || listedFieldProblem(model, page.conversation.members)) continue
    const other = fields.get(view.resource)
    if (other !== undefined && other !== page.conversation.members) throw new Error(`Views of "${view.resource}": their conversation pages list members in "${other}" and "${page.conversation.members}", but the relay's channel on "${view.resource}" takes one members field`)
    fields.set(view.resource, page.conversation.members)
  }
  return Object.fromEntries([...fields].map(([resource, field]) => [resource, { members: { field } }]))
}

/**
 * The channels of the relay the app uses or can be moved to: `realtime.relay`'s, else the defaults. Undefined when the
 * app cannot use the relay: no `realtime.relay`, and no sign-in, whose sessions tickets name, or no default channel.
 * It decides whether `protobase migration` writes the relay's part, the build's manifest entry, and what the
 * platform's switch turns on.
 */
export const appRelayChannels = (declared: RealtimeRelayOptions | undefined, app: RelayApp) => {
  if (declared) return declared.channels ?? defaultRelayChannels(app)
  if (!app.signIn) return
  const derived = defaultRelayChannels(app)
  return Object.keys(derived).length > 0 ? derived : undefined
}
