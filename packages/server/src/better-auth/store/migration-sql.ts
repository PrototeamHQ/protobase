import { sql, type RawBuilder } from 'kysely'
import { ddl, ddlText } from './ddl'
import { createMigrationsTable, migrationsTable, recordMigrations } from './migrations-table'
import { legacyVersions } from './steps/legacy-versions'
import type { RenderedStep } from './steps/render'
import type { StoreNames } from './store-names'

// The text a migration file of the project holds: each statement ends with a semicolon, a blank line between them.

/** The statements as SQL text. */
export const statementsSql = (statements: RawBuilder<unknown>[]) => statements.map((statement) => `${ddlText(statement)};`).join('\n\n')

const comment = ({ module, step, on }: RenderedStep) => `-- ${module} ${step.step} ${step.name}${on === undefined ? '' : `, on the tables of ${on}`}: ${step.title}.`

// The statements of the part at `i`; after the last one of a version of `versions`, the row that records it.
const partStatements = (names: StoreNames, rendered: RenderedStep[], versions: number[], i: number) => {
  const part = rendered[i]!
  const recorded = versions.includes(part.version) && !rendered.slice(i + 1).some((later) => later.version === part.version)
  return [...part.statements, ...(recorded ? [recordMigrations(names, legacyVersions.filter(({ version }) => version === part.version))] : [])]
}

/**
 * The rendered steps, each under a comment naming it; after the last statements of each version of `versions`, the
 * row that records it in `auth_migrations`.
 */
export const stepsSql = (names: StoreNames, rendered: RenderedStep[], versions: number[]) =>
  rendered.map((part, i) => `${comment(part)}\n${statementsSql(partStatements(names, rendered, versions, i))}`).join('\n\n')

// The dollar quotes of a guarded part: its block, and each statement it executes.
const blockQuote = '$version$'
const statementQuote = '$statement$'

// The statements as one block that runs them only while `auth_migrations` has not recorded `version`.
const unlessRecorded = (names: StoreNames, version: number, statements: RawBuilder<unknown>[]) => {
  const texts = statements.map(ddlText)
  const quoted = texts.find((text) => text.includes(blockQuote) || text.includes(statementQuote))
  if (quoted) throw new Error(`A step's statement holds ${blockQuote} or ${statementQuote}, which guard it: ${quoted}`)
  const table = migrationsTable(names)
  const recorded = ddlText(ddl`select from ${table} where ${table.columns.version} = ${sql.lit(version)}`)
  return `do ${blockQuote} begin\nif not exists (${recorded}) then\n${texts.map((text) => `execute ${statementQuote}${text}${statementQuote};`).join('\n')}\nend if;\nend ${blockQuote};`
}

/**
 * The rendered steps as `stepsSql` writes them, each part run only while `auth_migrations` lacks its version, so a
 * database that has a version already, such as one `protobase-serve migrate-release` brought to a release, skips it.
 */
export const guardedStepsSql = (names: StoreNames, rendered: RenderedStep[], versions: number[]) =>
  rendered.map((part, i) => `${comment(part)}\n${unlessRecorded(names, part.version, partStatements(names, rendered, versions, i))}`).join('\n\n')

/**
 * The migrations table, for a store that has none yet, in the store's schema, made when it is missing. With
 * `ifMissing`, the table too is made only when missing, for a database a host made it in already.
 */
export const migrationsTableSql = (names: StoreNames, ifMissing = false) => {
  const schema = names.schema === undefined ? [] : [ddl`create schema if not exists ${names.schema}`]
  return `-- The record of the auth store's migrations.\n${statementsSql([...schema, createMigrationsTable(names, ifMissing)])}`
}
