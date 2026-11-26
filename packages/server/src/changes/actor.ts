import type { EventActor } from '@protobase/schema'
import { runningJobs } from '../jobs/current'
import { dispatchJobName } from './capture-sql'
import type { Deps } from '../deps'
import type { Session } from '../types'

/** Who writes in a session's write transaction: the actor its `protobase_actor` message and the change capture name. */
export const sessionActor = (session: Session): EventActor => ({ id: session.user.id, roles: session.user.roles })

/** The setting a write transaction sets so the change capture records who wrote, when a resource has events or history. */
export const actorSettings = (deps: Pick<Deps, 'actorSetting'>, session: Session): Record<string, string> => {
  if (!deps.actorSetting) return {}
  return { [deps.actorSetting]: JSON.stringify(sessionActor(session)) }
}

/** After a write committed: has this process's dispatcher deliver its events now, rather than at its next poll. */
export const wakeDispatch = (deps: Pick<Deps, 'actorSetting'>) => {
  if (deps.actorSetting) runningJobs()?.wake(dispatchJobName)
}
