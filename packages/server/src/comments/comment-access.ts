import type { Db } from '@protobase/query'
import { anonymousUserId } from '../anonymous'
import type { Deps } from '../deps'
import { forbidden, notFound } from '../problem'
import { fetchReadable } from '../fetch-readable'
import type { Entry } from '../registry'
import { requestAccess, requireOperation, type RequestAccess } from '../request-access'
import type { DeletedRows } from '../sql-parts'
import type { Session } from '../types'

/** The caller's access to a resource with comments, who must be allowed to read it; a resource without is a 404. */
export const commentAccess = async (deps: Deps, entry: Entry, session: Session) => {
  if (!entry.model.comments) throw notFound(`${entry.name} takes no comments`)
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  return access
}

/** Writing a comment, or looking for someone to mention, takes a signed-in user: a visitor is no author. */
export const requireSignedIn = (session: Session) => {
  if (session.anonymous || session.user.id === anonymousUserId) throw forbidden('comment-needs-user', 'Sign in to comment')
}

/** The record with this key when `access` may read it (tenant, row filter and record-level rule), with `fields` besides its key. */
export const readableRecord = (trx: Db, access: RequestAccess, key: (string | number)[], deleted: DeletedRows, fields: readonly string[] = []) => {
  const names = [...new Set([...access.full.primaryKey, ...fields])]
  return fetchReadable(trx, access, key, deleted, { fields: names.map((name) => access.full.fields[name]!) })
}

/**
 * The sessions these users act with now, in the caller's tenant, built as a subscription's is (see `subscriberSession`);
 * none for one who holds no role there, or when the project has no auth to ask.
 */
export const userSessions = (deps: Deps, caller: Session, ids: readonly string[]) =>
  Promise.all(
    ids.map(async (id): Promise<{ id: string; session?: Session }> => {
      const users = deps.comments?.users
      const roles = users ? await users.roles({ id, ...(caller.tenant !== undefined && { tenant: caller.tenant }) }) : []
      if (roles.length === 0) return { id }
      return { id, session: { user: { id, roles }, ...(caller.tenant !== undefined && { tenant: caller.tenant, organization: { id: caller.tenant } }) } }
    }),
  )

/** Whether the user of `session` may read the record: the same operation, tenant, row filter and record-level rule as a get. */
export const mayRead = async (trx: Db, deps: Deps, entry: Entry, session: Session | undefined, key: (string | number)[]) => {
  if (!session) return false
  const access = await requestAccess(deps, entry, session)
  if (!access.resolved.operations.read) return false
  return (await readableRecord(trx, access, key, 'hide')) !== undefined
}
