import type { TransactionSql } from 'postgres'

// What older code reads of the database's schema: its relations with their columns, the constraints and unique
// indexes that limit what it may write, its functions, the triggers that keep tables up to date, and enum values.
// Read in one query, outside Postgres's own schemas.

export type CatalogRelation = { oid: string; name: string; kind: string }
export type CatalogColumn = { relation: string; name: string; number: number; type: string; notNull: boolean; hasDefault: boolean; generated: boolean }
/** A check, unique, foreign key, primary key or exclusion constraint, or a unique index, by its relation's oid. */
export type CatalogLimit = { relation: string; name: string; definition: string }
export type CatalogFunction = { key: string; result: string }
export type CatalogTrigger = { relation: string; function: string }
export type CatalogEnum = { name: string; labels: string[] }

export type Catalog = {
  relations: CatalogRelation[]
  columns: CatalogColumn[]
  constraints: CatalogLimit[]
  uniqueIndexes: CatalogLimit[]
  functions: CatalogFunction[]
  triggers: CatalogTrigger[]
  enums: CatalogEnum[]
}

const catalogSql = `with ns as (
  select oid, nspname from pg_namespace
  where nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and nspname not like 'pg\\_temp\\_%' and nspname not like 'pg\\_toast\\_temp\\_%'
), rel as (
  select c.oid, format('%I.%I', ns.nspname, c.relname) as name, c.relkind::text as kind from pg_class c join ns on ns.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
), fn as (
  select p.oid, format('%I.%I(%s)', ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as key, pg_get_function_result(p.oid) as result
  from pg_proc p join ns on ns.oid = p.pronamespace
)
select json_build_object(
  'relations', (select coalesce(json_agg(json_build_object('oid', oid::text, 'name', name, 'kind', kind)), '[]') from rel),
  'columns', (select coalesce(json_agg(json_build_object('relation', a.attrelid::text, 'name', a.attname, 'number', a.attnum, 'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull, 'hasDefault', a.atthasdef, 'generated', a.attgenerated <> '')), '[]')
    from pg_attribute a join rel on rel.oid = a.attrelid where a.attnum > 0 and not a.attisdropped and rel.kind <> 'S'),
  'constraints', (select coalesce(json_agg(json_build_object('relation', k.conrelid::text, 'name', k.conname, 'definition', pg_get_constraintdef(k.oid))), '[]')
    from pg_constraint k join rel on rel.oid = k.conrelid where k.contype in ('c', 'u', 'f', 'p', 'x')),
  'uniqueIndexes', (select coalesce(json_agg(json_build_object('relation', i.indrelid::text, 'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid))), '[]')
    from pg_index i join rel on rel.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid where i.indisunique),
  'functions', (select coalesce(json_agg(json_build_object('key', key, 'result', result)), '[]') from fn),
  'triggers', (select coalesce(json_agg(json_build_object('relation', t.tgrelid::text, 'function', fn.key)), '[]')
    from pg_trigger t join rel on rel.oid = t.tgrelid join fn on fn.oid = t.tgfoid where not t.tgisinternal),
  'enums', (select coalesce(json_agg(json_build_object('name', format('%I.%I', ns.nspname, t.typname),
      'labels', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))), '[]')
    from pg_type t join ns on ns.oid = t.typnamespace where t.typtype = 'e')
) as catalog`

/** The database's schema as `contractions` compares it, read in `tx`. */
export const readCatalog = async (tx: TransactionSql): Promise<Catalog> => {
  const [row] = await tx.unsafe<{ catalog: Catalog }[]>(catalogSql)
  return row!.catalog
}
