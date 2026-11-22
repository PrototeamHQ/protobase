import type { ResourceModel } from '@protobase/schema'
import type { RelayPresence } from './relay-options'

/** The statuses a presence report names. */
export const presenceStatuses = ['online', 'away', 'offline'] as const

export type PresenceStatus = (typeof presenceStatuses)[number]

/** The presence resource, by its model, with the fields the reports write. */
export type PresenceModel = { model: ResourceModel; user: string; status: string; at: string }

/**
 * The presence options against the models, or an error naming what does not fit: the resource is captured, so its
 * changes raise events, and keyed by its user field, so a report upserts one record per person; its status field takes
 * text or an enum of the three statuses, and its at field is a timestamp.
 */
export const presenceModel = (presence: RelayPresence, byName: Map<string, ResourceModel>, captured: (model: ResourceModel) => boolean): PresenceModel => {
  const at = 'realtime.relay.presence'
  const model = byName.get(presence.resource)
  if (!model) throw new Error(`${at}.resource: the app has no resource "${presence.resource}"`)
  if (!captured(model)) throw new Error(`${at}.resource: the changes of "${model.name}" are not captured, so they would raise no events: declare .live() on it`)
  const field = (name: string, key: string) => {
    const found = model.fields[name]
    if (!found) throw new Error(`${at}.${key}: "${model.name}" has no field "${name}"`)
    return found
  }
  field(presence.user, 'user')
  if (model.primaryKey.length !== 1 || model.primaryKey[0] !== presence.user) throw new Error(`${at}.user: "${model.name}" must be keyed by "${presence.user}", one record per person`)
  const status = field(presence.status, 'status')
  const takesStatuses = status.type === 'text' || (status.type === 'enum' && presenceStatuses.every((value) => status.enumValues?.includes(value)))
  if (!takesStatuses) throw new Error(`${at}.status: "${presence.status}" of "${model.name}" must be text or an enum of ${presenceStatuses.join(', ')}`)
  if (field(presence.at, 'at').type !== 'timestamp') throw new Error(`${at}.at: "${presence.at}" of "${model.name}" must be a timestamp`)
  return { model, user: presence.user, status: presence.status, at: presence.at }
}
