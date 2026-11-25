import type { ResourceReplaceable, SchemaModule } from '../../schema-modules/schema-module'
import { grantsSql, revokeSql } from './grants-sql'
import { readQuery } from './read-query'
import { runnerSql } from './runner-sql'
import { roleStep } from './steps/001-role'

/**
 * The query role's select on one resource's table and usage on its schema. Taken back once the resource is gone,
 * leaving usage on the schema while the role reads another table there.
 */
const grants: ResourceReplaceable = {
  name: 'grants',
  title: 'The grants of the query role',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => grantsSql(input as { schema?: string; name: string }),
  drop: (_names, table) => revokeSql(table),
  keptWhileOthers: false,
}

/**
 * The role the built-in assistant's read-only queries run as, `<database>_query`, which reads only the resources'
 * tables (`queryInput`), and `query.run_read_only`, the runner every query goes through as that role.
 */
export const queryModule: SchemaModule = {
  label: "the query role of the assistant's read-only queries",
  title: "The role the assistant's read-only queries run as, which reads only the resources' tables",
  steps: [{ step: 1, name: 'role', title: 'The query role', additive: true, sql: roleStep }],
  // Not marked compatible with an earlier version: the code of one before it is not known to run on it.
  replaceables: [{ name: 'runner', title: 'The runner the queries go through, query.run_read_only()', version: 1, compatibleFrom: 1, sql: runnerSql }],
  resourceReplaceables: [grants],
  read: readQuery(grants),
}
