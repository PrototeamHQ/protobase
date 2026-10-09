import type { Sql } from './connect'

// Tables, plus views and materialized views when asked: doctor checks resources declared on them, scaffold does not.
export type Relations = { views?: boolean }

const userRelations = ({ views = false }: Relations) => `
  c.relkind in ('r', 'p'${views ? ", 'v', 'm'" : ''})
  and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg_temp%'
`

export const selectColumns = (sql: Sql, relations: Relations) => sql<
  {
    schema: string
    table: string
    relkind: string
    name: string
    position: number
    typeName: string
    formatted: string
    isEnum: boolean
    enumValues: string[] | null
    notNull: boolean
    identity: boolean
    identityAlways: boolean
    generated: boolean
    defaultExpr: string | null
  }[]
>`
  select n.nspname as schema, c.relname as table, c.relkind as relkind, a.attname as name, a.attnum::int as position,
    bt.typname as "typeName", format_type(a.atttypid, a.atttypmod) as formatted,
    (bt.typtype = 'e') as "isEnum",
    (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = bt.oid) as "enumValues",
    a.attnotnull as "notNull", (a.attidentity <> '') as identity, (a.attidentity = 'a') as "identityAlways", (a.attgenerated <> '') as generated,
    pg_get_expr(d.adbin, d.adrelid) as "defaultExpr"
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  join pg_type bt on bt.oid = case when t.typtype = 'd' then t.typbasetype else t.oid end
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where ${sql.unsafe(userRelations(relations))} and a.attnum > 0 and not a.attisdropped
  order by n.nspname, c.relname, a.attnum
`

export const selectForeignKeys = (sql: Sql, relations: Relations) => sql<
  { schema: string; table: string; columns: string[]; refSchema: string; refTable: string; refColumns: string[] }[]
>`
  select n.nspname as schema, c.relname as table,
    (select array_agg(a.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns,
    rn.nspname as "refSchema", rc.relname as "refTable",
    (select array_agg(a.attname::text order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as "refColumns"
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class rc on rc.oid = con.confrelid
  join pg_namespace rn on rn.oid = rc.relnamespace
  where con.contype = 'f' and ${sql.unsafe(userRelations(relations))}
`

export const selectChecks = (sql: Sql, relations: Relations) => sql<
  { schema: string; table: string; columns: string[]; definition: string }[]
>`
  select n.nspname as schema, c.relname as table,
    (select array_agg(a.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns,
    pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'c' and con.conkey is not null and ${sql.unsafe(userRelations(relations))}
`

export const selectIndexes = (sql: Sql, relations: Relations) => sql<
  {
    schema: string
    table: string
    name: string
    columns: (string | null)[]
    unique: boolean
    primary: boolean
    partial: boolean
    method: string
  }[]
>`
  select n.nspname as schema, c.relname as table, ic.relname as name,
    (select array_agg(case when k.attnum = 0 then null else a.attname::text end order by k.ord)
      from unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
      left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      where k.ord <= i.indnkeyatts) as columns,
    i.indisunique as unique, i.indisprimary as primary, (i.indpred is not null) as partial, am.amname as method
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class ic on ic.oid = i.indexrelid
  join pg_am am on am.oid = ic.relam
  where i.indisvalid and ${sql.unsafe(userRelations(relations))}
`
