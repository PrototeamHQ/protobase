import { sql, type Expression, type SqlBool } from 'kysely'
import { columnRef, tableSource } from './columns'
import { orderTerm } from './order'
import type { ParentRead, RelatedPage } from './scope'
import { seekCondition } from './seek'

type Parent = NonNullable<ParentRead['parent']>

const whereAll = (conditions: Expression<SqlBool>[]) => (conditions.length === 0 ? sql`` : sql` where ${sql.join(conditions, sql` and `)}`)

// A page is its rows after the token's, in its order, at most its limit; without a limit the order changes nothing.
const pageOf = (page: RelatedPage | undefined, conditions: Expression<SqlBool>[]) => {
  const after = page?.after ? [seekCondition(page.keys, page.after, 'after')] : []
  const where = whereAll([...conditions, ...after])
  if (page?.limit === undefined) return where
  return sql`${where} order by ${sql.join(page.keys.map((key) => orderTerm(key)))} limit ${page.limit}`
}

/**
 * The keys of the parent records the conditions keep, on the page the term reads: the parent's `key`, or, when it is a
 * JSON list of keys, each item of each record's list that is a valid value of the item type. A record whose list is
 * null, empty or no list at all adds none, and neither does an item such as `"x"` among integer keys.
 */
export const parentKeys = (parent: Parent, page: RelatedPage | undefined, conditions: Expression<SqlBool>[]) => {
  const key = columnRef(parent.key)
  const rows = sql`from ${tableSource(parent.model)}${pageOf(page, conditions)}`
  if (!parent.items) return sql`select ${key} ${rows}`
  const type = sql.raw(parent.items)
  const list = sql`p.k::jsonb`
  const items = sql`jsonb_array_elements_text(case when jsonb_typeof(${list}) = 'array' then ${list} end) as e(v)`
  return sql`select e.v::${type} from (select ${key} as k ${rows}) as p cross join lateral ${items} where pg_input_is_valid(e.v, ${parent.items})`
}
