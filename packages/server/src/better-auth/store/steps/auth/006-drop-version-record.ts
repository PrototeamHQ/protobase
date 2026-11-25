import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The record of versions a store kept before `auth_steps`, by its built-in name, which nothing reads any more. */
export const versionRecord = 'auth_migrations'

/**
 * The drop of the record of versions, once `auth_steps` holds every step it recorded: the migrations of Protobase 0.130
 * filled `auth_steps` from it, so the store keeps one record of its steps. The one step that drops a table, which the
 * step lint allows it alone (`drops`).
 */
export const dropVersionRecord: Step = {
  step: 6,
  version: 19,
  name: 'drop_version_record',
  title: 'The drop of the former record of versions, which auth_steps replaced',
  tables: [],
  drops: [versionRecord],
  statements: ({ former }) => [ddl`drop table if exists ${former(versionRecord)}`],
}
