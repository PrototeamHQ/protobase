import type { Db } from '@protobase/query'
import { appPath } from '@protobase/schema'
import { decodeKey, encodeKey } from '@protobase/schema/internal'
import { toolKey } from '../assistant/records'
import type { ChannelSender } from '../channels/channel-sender'
import type { Deps } from '../deps'
import { sendNotification } from '../notifications/send-notification'
import type { CallsService } from './calls-service-type'
import type { CallsOptions } from './calls-options'
import type { CallsRuntime } from './calls-runtime'

/** What calls reach of the rest of the app: the live stream's notices, record channels, statuses and notifications. */
export type CallsWiring = {
  /** The changes schema, whose notices table tells open pages of their user's rings. */
  notices: string
  /** Where a record's readers hear its calls changed: its channel. */
  channels: () => ChannelSender
  /** With `status`: who of these users is on do not disturb. */
  doNotDisturb?: (db: Db, userIds: readonly string[]) => Promise<Set<string>>
  /** With notifications: a ring is kept in the bell, and pushed to devices. */
  notifications: boolean
}

/** The event a record's channel hears its calls on, with `{ items }` as `GET /{resource}/{key}:calls` answers. */
export const callsEvent = 'calls'

/** An app's calls over its resources: the runtime loaded at the first use, so an app that never calls loads none of it. */
export const callsService = (deps: () => Deps, options: CallsOptions, wiring: CallsWiring): CallsService => {
  let runtime: Promise<CallsRuntime> | undefined
  const load = async () => {
    const [{ callsRuntime }, { ringer }, { sqlRingStore }] = await Promise.all([import('./calls-runtime'), import('./ringer'), import('./ring-store')])
    const { db, statementTimeoutMs, report, registry } = deps()
    const recordUrl = ({ resource, key }: { resource: string; key: string }) => appPath({ kind: 'record', resource, key: decodeKey(key, registry.find(resource)!.keyTypes) })
    const rings = ringer({
      store: sqlRingStore(db, wiring.notices),
      recordUrl,
      ...(wiring.doNotDisturb && { doNotDisturb: (userIds: readonly string[]) => wiring.doNotDisturb!(db, userIds) }),
      ...(wiring.notifications && {
        notify: async ({ userIds, ...message }) =>
          sendNotification(db, { userIds, inbox: true }, { ...message, urgency: 'high', ttl: 60, tag: `call-${message.data.call}` }),
      }),
    })
    return callsRuntime({
      db,
      timeoutMs: statementTimeoutMs,
      options,
      report,
      rings,
      announce: (record, items) => wiring.channels().broadcast({ resource: record.resource, key: record.key, event: callsEvent, payload: { items } }),
    })
  }
  return {
    runtime: () => (runtime ??= load()),
    recordOf: (resource, key) => {
      const found = toolKey(deps(), resource, key)
      return { resource: found.entry.name, key: encodeKey(found.key) }
    },
  }
}
