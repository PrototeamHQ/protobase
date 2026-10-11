import type { EventActor } from '@protobase/schema'
import type { Deps } from '../deps'
import type { Session } from '../types'

/** The setting a write transaction sets so the change capture records who wrote, when a resource has events. */
export const actorSettings = (deps: Pick<Deps, 'actorSetting'>, session: Session): Record<string, string> => {
  if (!deps.actorSetting) return {}
  const actor: EventActor = { id: session.user.id, roles: session.user.roles }
  return { [deps.actorSetting]: JSON.stringify(actor) }
}
