import type { RawBuilder } from 'kysely'
import { ddl, ddlText } from './ddl'
import { createMigrationsTable, recordMigrations } from './migrations-table'
import { legacyVersions } from './steps/legacy-versions'
import type { RenderedStep } from './steps/render'
import type { StoreNames } from './store-names'

// The text a migration file of the project holds: each statement ends with a semicolon, a blank line between them.

/** The statements as SQL text. */
export const statementsSql = (statements: RawBuilder<unknown>[]) => statements.map((statement) => `${ddlText(statement)};`).join('\n\n')

const comment = ({ module, step, on }: RenderedStep) => `-- ${module} ${step.step} ${step.name}${on === undefined ? '' : `, on the tables of ${on}`}: ${step.title}.`

/**
 * The rendered steps, each under a comment naming it; after the last statements of each version of `versions`, the
 * row that records it in `auth_migrations`.
 */
export const stepsSql = (names: StoreNames, rendered: RenderedStep[], versions: number[]) =>
  rendered
    .map((part, i) => {
      const recorded = versions.includes(part.version) && !rendered.slice(i + 1).some((later) => later.version === part.version)
      const record = recorded ? [recordMigrations(names, legacyVersions.filter(({ version }) => version === part.version))] : []
      return `${comment(part)}\n${statementsSql([...part.statements, ...record])}`
    })
    .join('\n\n')

/** The migrations table, for a store that has none yet, in the store's schema, made when it is missing. */
export const migrationsTableSql = (names: StoreNames) => {
  const schema = names.schema === undefined ? [] : [ddl`create schema if not exists ${names.schema}`]
  return `-- The record of the auth store's migrations.\n${statementsSql([...schema, createMigrationsTable(names)])}`
}
