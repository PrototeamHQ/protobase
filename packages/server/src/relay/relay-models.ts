import type { ResourceModel } from '@protobase/schema'
import { relatedTarget } from '@protobase/schema/internal'
import { capturedBy } from '../changes/capture-sql'
import type { RealtimeRelayOptions } from './relay-options'

/** A channel resource's members resource, by its model. */
export type MembersModel = { model: ResourceModel; field: string; user: string }

/** A field whose value names the channel record its records are noticed on. */
export type Placement = { field: string; channel: string }

/** The relay's options read against the resources. */
export type RelayModels = {
  /** The channel resources, each with its members resource when it has one, and its mentions field. */
  channels: Map<string, { members?: MembersModel; mentions?: string }>
  /**
   * By resource, the fields that place its records on channels: a channel resource's own key, and every relation to a
   * channel resource. Only resources whose changes are captured, such as live ones, are here.
   */
  placements: Map<string, Placement[]>
  /** The members resources, by name, with the channel resources each fills (`channel`), one entry for each. */
  members: Map<string, Array<{ channel: string } & MembersModel>>
}

/**
 * The options against the models, or an error naming what does not fit: a channel resource needs a key of one field, and
 * its members resource a captured table, such as one with `.live()`, a relation field to it and a user field.
 */
export const relayModels = (options: RealtimeRelayOptions, models: readonly ResourceModel[]): RelayModels => {
  const byName = new Map(models.map((model) => [model.name, model]))
  const captured = capturedBy(models)
  const channels: RelayModels['channels'] = new Map()
  const members: RelayModels['members'] = new Map()
  for (const [name, channel] of Object.entries(options.channels)) {
    const at = `realtime.relay.channels.${name}`
    const model = byName.get(name)
    if (!model) throw new Error(`${at}: the app has no resource "${name}"`)
    if (model.primaryKey.length !== 1) throw new Error(`${at}: a channel resource needs a key of one field, as a channel is named <resource>/<key>`)
    const own = channel.members && membersModel(channel.members, name, byName, `${at}.members`)
    if (own && !captured(own.model)) throw new Error(`${at}.members: the changes of "${own.model.name}" are not captured, so the relay would not hear of them: declare .live() on it`)
    if (own) members.set(own.model.name, [...(members.get(own.model.name) ?? []), { ...own, channel: name }])
    channels.set(name, { ...(own && { members: own }), ...(channel.mentions !== undefined && { mentions: channel.mentions }) })
  }
  const placements = new Map(
    models.filter(captured).flatMap((model) => {
      const fields = Object.values(model.fields).flatMap((field) => {
        const target = relatedTarget(model, field)
        return target !== undefined && channels.has(target) ? [{ field: field.name, channel: target }] : []
      })
      return fields.length > 0 ? [[model.name, fields] as const] : []
    }),
  )
  for (const [name, { mentions }] of channels) {
    if (mentions === undefined) continue
    const has = [...placements].some(([resource, fields]) => fields.some((placement) => placement.channel === name) && Object.hasOwn(byName.get(resource)!.fields, mentions))
    if (!has) throw new Error(`realtime.relay.channels.${name}.mentions: no captured resource noticed on the channel has a field "${mentions}"`)
  }
  return { channels, placements, members }
}

const membersModel = (members: NonNullable<RealtimeRelayOptions['channels'][string]['members']>, channel: string, byName: Map<string, ResourceModel>, at: string): MembersModel => {
  const model = byName.get(members.resource)
  if (!model) throw new Error(`${at}.resource: the app has no resource "${members.resource}"`)
  const channelField = model.fields[members.channel]
  if (!channelField || relatedTarget(model, channelField) !== channel) throw new Error(`${at}.channel: "${members.channel}" of "${model.name}" is no relation to "${channel}"`)
  if (!Object.hasOwn(model.fields, members.user)) throw new Error(`${at}.user: "${model.name}" has no field "${members.user}"`)
  return { model, field: members.channel, user: members.user }
}
