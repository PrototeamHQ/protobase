import { definitionFieldTypes, definitionsSchema, maxNameBytes, userTableName, userTablesSchema } from './names'

const nameCheck = (column: string) => `check (${column} ~ '${userTableName.source}' and octet_length(${column}) <= ${maxNameBytes})`

/** The table of definitions: one row per table users add, its labels and a version, 1 when added, that each change of it raises. */
export const tablesSql = () => `create table ${definitionsSchema}.tables (
  id bigint generated always as identity primary key,
  name text not null unique ${nameCheck('name')},
  singular_label text not null,
  plural_label text not null,
  title_field text ${nameCheck('title_field')},
  version bigint not null default 1 check (version > 0)
)`

/** Gives a definitions table made before new definitions started at version 1 that default. */
export const versionDefaultSql = () => `alter table ${definitionsSchema}.tables alter column version set default 1`

/** The fields of each definition, in order, each with its label and type; a decimal names its precision and scale. */
export const fieldsSql = () => `create table ${definitionsSchema}.fields (
  table_id bigint not null references ${definitionsSchema}.tables (id) on delete cascade,
  name text not null ${nameCheck('name')} check (name not in ('id', 'etag')),
  label text not null,
  type text not null check (type in (${definitionFieldTypes.map((type) => `'${type}'`).join(', ')})),
  required boolean not null,
  position integer not null,
  precision integer check (precision between 1 and 1000),
  scale integer check (scale between 0 and precision),
  primary key (table_id, name),
  check ((type = 'decimal') = (precision is not null and scale is not null))
)`

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
