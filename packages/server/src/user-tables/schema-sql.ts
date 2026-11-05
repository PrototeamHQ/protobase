import { definitionFieldTypes, definitionsSchema, maxNameBytes, userTableName, userTablesSchema } from './names'

const nameCheck = (column: string) => `check (${column} ~ '${userTableName.source}' and octet_length(${column}) <= ${maxNameBytes})`

/**
 * The table of definitions: one row per table users add, its labels and a version, 1 when added, that each change of it
 * raises. With organizations a definition belongs to the one it was made in (`organization_id`), and its table is named
 * `t<id>_<name>`, so two organizations can each have a table of one name; without, the table is the name. `table_name`
 * is the table's name in the user tables schema and the name of its resource.
 */
export const tablesSql = () => `create table ${definitionsSchema}.tables (
  id bigint generated always as identity primary key,
  name text not null ${nameCheck('name')},
  organization_id text,
  singular_label text not null,
  plural_label text not null,
  title_field text ${nameCheck('title_field')},
  version bigint not null default 1 check (version > 0),
  ${tableNameColumn},
  ${tenantKeyColumn},
  unique (id, tenant_key)
)`

// The served name, computed by the database so nothing else derives it.
const tableNameColumn = `table_name text not null unique generated always as (case when organization_id is null then name else 't' || id || '_' || name end) stored ${nameCheck('table_name')}`

// The organization of a row, or '-' for none, never NULL, so a field's foreign key always compares it with its table's.
const tenantKeyColumn = "tenant_key text not null generated always as (coalesce(organization_id, '-')) stored"

/** A name is unique among the definitions of one organization, or of the app without organizations. */
export const nameIndexesSql = () => [
  `create unique index tables_name_key on ${definitionsSchema}.tables (name) where organization_id is null`,
  `create unique index tables_organization_name_key on ${definitionsSchema}.tables (organization_id, name) where organization_id is not null`,
]

/** Gives a definitions table made before new definitions started at version 1 that default. */
export const versionDefaultSql = () => `alter table ${definitionsSchema}.tables alter column version set default 1`

/**
 * The fields of each definition, in order, each with its label and type; a decimal names its precision and scale. A
 * field belongs to its table's organization: the foreign key compares both, so no field reaches another organization's
 * table, or one of none.
 */
export const fieldsSql = () => `create table ${definitionsSchema}.fields (
  table_id bigint not null,
  organization_id text,
  ${tenantKeyColumn},
  name text not null ${nameCheck('name')} check (name not in ('id', 'etag')),
  label text not null,
  type text not null check (type in (${definitionFieldTypes.map((type) => `'${type}'`).join(', ')})),
  required boolean not null,
  position integer not null,
  precision integer check (precision between 1 and 1000),
  scale integer check (scale between 0 and precision),
  primary key (table_id, name),
  foreign key (table_id, tenant_key) references ${definitionsSchema}.tables (id, tenant_key) on delete cascade,
  check ((type = 'decimal') = (precision is not null and scale is not null))
)`

/**
 * Serves a table's fields in position order, the order its own fields take: the admin's scan guard accepts a sort on
 * `position` only from an index that reaches it with `table_id` pinned. It also reaches a fields table made before it.
 */
export const fieldsPositionIndexSql = () => `create index if not exists fields_position_idx on ${definitionsSchema}.fields (table_id, position)`

/**
 * Brings a definitions table made before organizations to the shape of `tablesSql`: a name unique per organization and
 * the served name.
 */
export const organizationsSql = () => [
  `alter table ${definitionsSchema}.tables add column organization_id text, add column ${tableNameColumn}, add column ${tenantKeyColumn}, add unique (id, tenant_key)`,
  `alter table ${definitionsSchema}.tables drop constraint tables_name_key`,
  ...nameIndexesSql(),
]

/** Ties the fields made before organizations to their table's organization, as `fieldsSql` does. */
export const fieldsOrganizationSql = () =>
  `alter table ${definitionsSchema}.fields add column organization_id text, add column ${tenantKeyColumn}, add foreign key (table_id, tenant_key) references ${definitionsSchema}.tables (id, tenant_key) on delete cascade`

// The app's role, the one the migrations run as, may create in the data schema; nothing grants CREATE on the
// definitions schema, and no other role creates in either. The role owns both, so the grant states the intent rather
// than fencing it.
export const schemasSql = () => [
  'create extension if not exists pg_trgm',
  `create schema if not exists ${definitionsSchema}`,
  `revoke create on schema ${definitionsSchema} from public`,
  `create schema if not exists ${userTablesSchema}`,
  `revoke create on schema ${userTablesSchema} from public`,
  `grant usage, create on schema ${userTablesSchema} to current_user`,
]
