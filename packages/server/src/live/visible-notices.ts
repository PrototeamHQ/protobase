import { ringNotice } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { requestAccess } from '../request-access'
import type { Session } from '../types'
import type { Notice } from './notices-sql'

/**
 * Which notices a caller hears of: those of the live resources they may list or read, in their tenant, and, with
 * calls, those of the calls that ring them (`ringNotice`, keyed by the user's id). A notice names a record, never its
 * values, and the page reads the record again as the caller, so no row filter applies here.
 */
export const visibleNotices = async (deps: Deps, session: Session) => {
  // Each readable live resource, with the caller's tenant when it has one.
  const readable = new Map<string, string | undefined>()
  for (const entry of deps.registry.entries.filter((candidate) => candidate.model.live)) {
    const { operations } = (await requestAccess(deps, entry, session)).resolved
    if (!operations.list && !operations.read) continue
    if (entry.model.tenant && session.tenant === undefined) continue
    readable.set(entry.name, entry.model.tenant ? String(session.tenant) : undefined)
  }
  const rung = deps.calls && !session.anonymous && !session.client ? String(session.user.id) : undefined
  return (notice: Notice) => {
    if (notice.resource === ringNotice) return rung !== undefined && notice.key === rung
    return readable.has(notice.resource) && (readable.get(notice.resource) === undefined || readable.get(notice.resource) === notice.tenant)
  }
}
