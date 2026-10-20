import { sql, type RawBuilder } from 'kysely'
import { lateralName, type Embed, type ShapeItem } from './embed-shape'
import { filterSql } from './filter-sql'
import { orderSql, rangeSql, selectSql } from './shape-sql'

// The rows of the embed related to the current row of `source`, filtered, sorted and paged by its parameters.
const relatedRowsSql = (source: string, embed: Embed) => {
  const related = embed.relationship.join.map((pair) => sql`${sql.id(embed.alias, pair.target)} = ${sql.id(source, pair.source)}`)
  const where = sql.join([...related, ...embed.params.filters.map((filter) => filterSql(embed.alias, filter))], sql` and `)
  const columns = selectSql(embed.alias, embed.shape)
  return sql`select ${columns} from ${embed.from} as ${sql.id(embed.alias)}${joinsSql(embed.alias, embed.shape)} where ${where}${orderSql(embed.alias, embed.params.order)}${rangeSql(embed.params.range)}`
}

// A to-one embed is its row as an object, or no row; a to-many one its rows as an array, or no row when inner and empty.
const lateralSql = (source: string, embed: Embed) => {
  const rows = relatedRowsSql(source, embed)
  const body = embed.toOne
    ? sql`select row_to_json(pgrst_rows) as body from (${rows}) as pgrst_rows`
    : sql`select coalesce(json_agg(pgrst_rows), '[]') as body from (${rows}) as pgrst_rows${embed.inner ? sql` having count(*) > 0` : sql``}`
  return sql` ${sql.raw(embed.inner ? 'inner' : 'left')} join lateral (${body}) as ${sql.id(lateralName(embed))} on true`
}

/**
 * The lateral joins that read the embeds of the shape for each row of `source`, which `selectSql` picks their JSON
 * from. They run in the same query as the caller, so the RLS policies of every embedded table apply. An inner embed's
 * join drops the rows without a related row.
 */
export const joinsSql = (source: string, shape: readonly ShapeItem[]): RawBuilder<unknown> =>
  sql.join(shape.flatMap((item) => (item.kind === 'embed' ? [lateralSql(source, item)] : [])), sql``)
