import type { ResourceModel, ViewModel } from '@protobase/schema'
import { capturedBy } from '../changes/capture-sql'
import type { RealtimeRelayOptions, RelayChannelOptions } from './relay-options'

/** What the relay's channels are derived from: the app's views and resources, and whether it has its own sign-in. */
export type RelayApp = { views: readonly ViewModel[]; models: readonly ResourceModel[]; signIn: boolean }

/**
 * The relay's channels an app gets without declaring them: one for each resource whose conversation page has
 * `members`, a JSON field of user ids on the record, with that field as its members, when its changes are captured,
 * such as with `.live()`, so the relay hears who joins and leaves, and its key is one field. A page without `members`
 * gives none, as a channel without members would be open.
 */
export const defaultRelayChannels = ({ views, models }: Pick<RelayApp, 'views' | 'models'>): Record<string, RelayChannelOptions> => {
  const captured = capturedBy(models)
  const byName = new Map(models.map((model) => [model.name, model]))
  return Object.fromEntries(
    views.flatMap((view) => {
      const page = view.record
      const model = byName.get(view.resource)
      if (!page || !('conversation' in page) || page.conversation.members === undefined) return []
      if (!model || !captured(model) || model.primaryKey.length !== 1) return []
      return [[view.resource, { members: { field: page.conversation.members } }] as const]
    }),
  )
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
