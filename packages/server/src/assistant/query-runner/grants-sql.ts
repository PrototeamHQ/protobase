import type { TableName } from '../../schema-modules/schema-module'
import { queryRoleSql } from './runner-sql'

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/** A table as `to_regclass` takes it: the search path decides when it names no schema. */
export const regclassText = ({ schema, name }: TableName) => (schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name))

// Opens a block over `table` as the catalogue resolves it, `found`, which does nothing while the table does not exist.
const overTable = (table: TableName, declarations: string[], body: string[]) =>
  [
    'do $$',
    'declare',
    `  query_role text := ${queryRoleSql};`,
    `  found regclass := to_regclass(${literal(regclassText(table))});`,
    ...declarations,
    'begin',
    '  if found is null then return; end if;',
    ...body,
    'end $$;',
  ].join('\n')

/** Gives the query role select on `table` and usage on its schema; nothing while the table does not exist. */
export const grantsSql = (table: TableName) =>
  overTable(
    table,
    [],
    [
      "  execute format('grant usage on schema %s to %I', (select relnamespace::regnamespace from pg_class where oid = found), query_role);",
      "  execute format('grant select on table %s to %I', found, query_role);",
    ],
  )

// Whether the role holds `privilege` itself in `acl`.
const held = (acl: string, privilege: string) => `exists (select from aclexplode(${acl}) a where a.grantee = (select oid from pg_roles where rolname = query_role) and a.privilege_type = '${privilege}')`

/**
 * Takes select on `table` back from the query role, and usage on its schema once the role reads no other table there;
 * usage it does not hold itself is left alone, such as on a schema only its owner may grant on.
 */
export const revokeSql = (table: TableName) =>
  overTable(
    table,
    ['  found_schema regnamespace;'],
    [
      '  select relnamespace into found_schema from pg_class where oid = found;',
      "  execute format('revoke select on table %s from %I', found, query_role);",
      `  if exists (select from pg_class c where c.relnamespace = found_schema and ${held('c.relacl', 'SELECT')}) or not ${held('(select nspacl from pg_namespace where oid = found_schema)', 'USAGE')} then return; end if;`,
      "  execute format('revoke usage on schema %s from %I', found_schema, query_role);",
    ],
  )
