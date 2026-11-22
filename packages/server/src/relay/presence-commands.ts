import type { ResourceChange } from '../changes/resource-change'
import type { PublishCommand } from './relay-commands'
import type { RelayModels } from './relay-models'

/** The channel every signed-in person's ticket lists, which a person's presence is published on. */
export const peopleChannel = 'people'

/** The event a person's new presence is published as; the relay keeps `presence` for its clients' own. */
export const presenceEvent = 'presence_changed'

/** By person, the people who share a channel with members with them, as `coMembers` reads them. */
export type CoMembers = Map<string, string[]>

const presenceRecords = (models: RelayModels, changes: readonly ResourceChange[]) => {
  const presence = models.presence
  if (!presence) return []
  return changes.flatMap((change) => (change.resource === presence.model.name && change.after ? [{ change, record: change.after }] : []))
}

/** The people a batch changes the presence of, whose co-members `coMembers` reads. */
export const presencePeople = (models: RelayModels, changes: readonly ResourceChange[]) =>
  [...new Set(presenceRecords(models, changes).map(({ record }) => String(record[models.presence!.user])))]

/**
 * For each change of a person's presence, one publish on `people`, the same bytes to every one of the people who share
 * a channel with them; a person who shares none is published to no one.
 */
export const presenceCommands = (models: RelayModels, changes: readonly ResourceChange[], coMembers: CoMembers): PublishCommand[] =>
  presenceRecords(models, changes).flatMap(({ change, record }) => {
    const { user, status, at } = models.presence!
    const person = String(record[user])
    const users = coMembers.get(person) ?? []
    if (users.length === 0) return []
    return [{ kind: 'publish', id: `${change.sequence}:${peopleChannel}`, channel: peopleChannel, users, event: presenceEvent, payload: { user: person, status: record[status], at: record[at] } }]
  })
