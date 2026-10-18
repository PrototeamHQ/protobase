import { z } from 'zod'
import type { Deps } from '../deps'
import { parseParams } from '../params'
import { notFound } from '../problem'
import type { Entry } from '../registry'
import { readTransaction } from '../transactions'
import type { Session } from '../types'
import { commentAccess, mayRead, readableRecord, requireSignedIn, userSessions } from './comment-access'

const params = z.object({ q: z.string().max(100).optional() })

/** The most people `:mentionable` offers, and the candidates it checks to find them. */
const shown = 8
const candidates = 20

/**
 * The people the caller may mention on a record they may comment on: users whose name contains `q`, by name, who may
 * read the record themselves, without the caller. None without the project's auth.
 */
export const mentionable = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], query: Record<string, string>) => {
  const access = await commentAccess(deps, entry, session)
  requireSignedIn(session)
  const { q = '' } = parseParams(params, query)
  const users = deps.comments?.users
  const found = users ? (await users.search(q.trim(), candidates)).filter((user) => user.id !== String(session.user.id)) : []
  const sessions = await userSessions(deps, session, found.map((user) => user.id))
  const readers = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    if (!(await readableRecord(trx, access, key, 'hide'))) return undefined
    const ids = new Set<string>()
    for (const { id, session: theirs } of sessions) {
      if (ids.size === shown) break
      if (await mayRead(trx, deps, entry, theirs, key)) ids.add(id)
    }
    return ids
  })
  if (!readers) throw notFound(`No ${entry.name} with this key`)
  return { items: found.filter((user) => readers.has(user.id)).map(({ id, name }) => ({ id, name })) }
}
