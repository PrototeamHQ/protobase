import type { PeopleEvent } from '@protobase/schema/internal'
import { peopleChannel } from './presence-commands'
import type { PublishCommand } from './relay-commands'

/**
 * The publish that tells these people's open pages on `people` that their access or rings changed (`peopleEvents`),
 * narrowed to them; `id` is its own, so the relay sends it once. None for no one.
 */
export const peopleCommands = (id: string, userIds: readonly string[], event: PeopleEvent): PublishCommand[] => {
  if (userIds.length === 0) return []
  return [{ kind: 'publish', id: `${id}:${event}`, channel: peopleChannel, users: [...new Set(userIds)], event, payload: {} }]
}
