import type { EventActor } from '@protobase/schema'
import { runningJobs } from '../jobs/current'
import { dispatchJobName } from './capture-sql'
import type { Deps } from '../deps'
import type { Session } from '../types'

/** The setting a write transaction sets so the change capture records who wrote, when a resource has events. */
export const actorSettings = (deps: Pick<Deps, 'actorSetting'>, session: Session): Record<string, string> => {
  if (!deps.actorSetting) return {}
  const actor: EventActor = { id: session.user.id, roles: session.user.roles }
  return { [deps.actorSetting]: JSON.stringify(actor) }
}

/** After a write committed: has this process's dispatcher deliver its events now, rather than at its next poll. */
export const wakeDispatch = (deps: Pick<Deps, 'actorSetting'>) => {
  if (deps.actorSetting) runningJobs()?.wake(dispatchJobName)
}
