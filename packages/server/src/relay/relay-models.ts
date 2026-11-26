import type { ResourceModel } from '@protobase/schema'
import { relatedTarget } from '@protobase/schema/internal'
import { capturedBy } from '../changes/capture-sql'
import { presenceModel, type PresenceModel } from './presence-model'
import type { RealtimeRelaySettings, RelayListedMembers, RelayMembers } from './relay-options'

/** A channel resource's members resource, by its model. */
export type MembersModel = { model: ResourceModel; field: string; user: string }

/**
 * A channel resource whose records list their members' user ids in a JSON field, kept in `realtime.members`; with
 * `tenant`, the field of a record whose members field is null reaches every member of that organization instead.
 */
export type ListedModel = { model: ResourceModel; field: string; tenant?: string }

/** A channel resource as the relay reads it: who is in each channel, when it has members, and its mentions field. */
export type RelayChannel = { members?: MembersModel; listed?: ListedModel; mentions?: string }

/** Whether a channel has members, from a members resource or a field of its own, rather than being open. */
export const hasMembers = (channel: RelayChannel | undefined) => Boolean(channel?.members ?? channel?.listed)

/** A field whose value names the channel record its records are noticed on. */
export type Placement = { field: string; channel: string }

/** The relay's options read against the resources. */
export type RelayModels = {
  /** The channel resources, each with where its members come from when it has them, and its mentions field. */
  channels: Map<string, RelayChannel>
  /**
   * By resource, the fields that place its records on channels: a channel resource's own key, and every relation to a
   * channel resource. Only resources whose changes are captured, such as live ones, are here.
   */
  placements: Map<string, Placement[]>
  /** The members resources, by name, with the channel resources each fills (`channel`), one entry for each. */
  members: Map<string, Array<{ channel: string } & MembersModel>>
  /** The presence resource, when the relay reports presence. */
  presence?: PresenceModel
}

/**
 * The options against the models, or an error naming what does not fit: a channel resource needs a key of one field, and
 * its members resource a captured table, such as one with `.live()`, a relation field to it and a user field; one whose
 * members are a field of its own is captured itself, and that field is JSON.
 */
export const relayModels = (options: Pick<RealtimeRelaySettings, 'channels' | 'presence'>, models: readonly ResourceModel[]): RelayModels => {
  const byName = new Map(models.map((model) => [model.name, model]))
  const captured = capturedBy(models)
  const channels: RelayModels['channels'] = new Map()
  const members: RelayModels['members'] = new Map()
  for (const [name, channel] of Object.entries(options.channels)) {
    const at = `realtime.relay.channels.${name}`
    const model = byName.get(name)
    if (!model) throw new Error(`${at}: the app has no resource "${name}"`)
    if (model.primaryKey.length !== 1) throw new Error(`${at}: a channel resource needs a key of one field, as a channel is named <resource>/<key>`)
    const listed = channel.members && 'field' in channel.members ? listedModel(channel.members, model, `${at}.members`) : undefined
    if (listed && !captured(model)) throw new Error(`${at}.members: the changes of "${name}" are not captured, so the relay would not hear who joins or leaves: declare .live() on it`)
    const own = channel.members && !('field' in channel.members) ? membersModel(channel.members, name, byName, `${at}.members`) : undefined
    if (own && !captured(own.model)) throw new Error(`${at}.members: the changes of "${own.model.name}" are not captured, so the relay would not hear of them: declare .live() on it`)
    if (own) members.set(own.model.name, [...(members.get(own.model.name) ?? []), { ...own, channel: name }])
    channels.set(name, { ...(own && { members: own }), ...(listed && { listed }), ...(channel.mentions !== undefined && { mentions: channel.mentions }) })
  }
  const placements = new Map(
    models.filter(captured).flatMap((model) => {
      // A channel resource's own key places its records on their own channel, even when that key is a relation too.
      const own = channels.has(model.name) ? [{ field: model.primaryKey[0]!, channel: model.name }] : []
      const related = Object.values(model.fields).flatMap((field) => {
        const target = field.relation && relatedTarget(model, field)
        return target && channels.has(target) ? [{ field: field.name, channel: target }] : []
      })
      const fields = [...own, ...related]
      return fields.length > 0 ? [[model.name, fields] as const] : []
    }),
  )
  for (const [name, { mentions }] of channels) {
    if (mentions === undefined) continue
    const has = [...placements].some(([resource, fields]) => fields.some((placement) => placement.channel === name) && Object.hasOwn(byName.get(resource)!.fields, mentions))
    if (!has) throw new Error(`realtime.relay.channels.${name}.mentions: no captured resource noticed on the channel has a field "${mentions}"`)
  }
  return { channels, placements, members, ...(options.presence && { presence: presenceModel(options.presence, byName, captured) }) }
}

/**
 * Why a field cannot list a channel record's members, or undefined when it can: it is a JSON field of user ids whose
 * every change reaches the relay, so neither sensitive, which capture leaves out of the change, nor ignored by history.
 */
export const listedFieldProblem = (model: ResourceModel, field: string) => {
  const definition = model.fields[field]
  if (definition?.type !== 'json') return `"${field}" of "${model.name}" is no JSON field of user ids`
  if (definition.sensitive) return `"${field}" of "${model.name}" is sensitive, so its changes never reach the relay`
  if (model.historyIgnore?.includes(field)) return `"${field}" of "${model.name}" is ignored by its history, so its changes never reach the relay`
  return
}

const listedModel = ({ field, organization }: RelayListedMembers, model: ResourceModel, at: string): ListedModel => {
  const problem = listedFieldProblem(model, field)
  if (problem) throw new Error(`${at}.field: ${problem}`)
  if (organization === undefined) return { model, field }
  if (!model.tenant) throw new Error(`${at}.organization: "${model.name}" has no tenant field (.tenant), so a record has no organization to reach`)
  return { model, field, tenant: model.tenant }
}

const membersModel = (members: RelayMembers, channel: string, byName: Map<string, ResourceModel>, at: string): MembersModel => {
  const model = byName.get(members.resource)
  if (!model) throw new Error(`${at}.resource: the app has no resource "${members.resource}"`)
  const channelField = model.fields[members.channel]
  if (!channelField || relatedTarget(model, channelField) !== channel) throw new Error(`${at}.channel: "${members.channel}" of "${model.name}" is no relation to "${channel}"`)
  if (!Object.hasOwn(model.fields, members.user)) throw new Error(`${at}.user: "${model.name}" has no field "${members.user}"`)
  return { model, field: members.channel, user: members.user }
}
