import { sql, type SqlBool } from 'kysely'
import { baseQuery } from './base-query'
import { columnRef } from './columns'
import type { Db } from './db'
import type { ParentRead } from './scope'

/** Whether the caller reads the parent record whose key is `value`, by the same scope a read of its children keeps to. */
export const readsParent = async (db: Db, read: ParentRead, value: string | number) => {
  if (!read.parent) return false
  const { model, key, scope } = read.parent
  const found = await baseQuery(db, model, undefined, scope).select(sql`1`.as('one')).where(sql<SqlBool>`${columnRef(key)} = ${value}`).limit(1).executeTakeFirst()
  return found !== undefined
}
