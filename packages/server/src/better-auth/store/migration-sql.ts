import type { RawBuilder } from 'kysely'
import { ddl, ddlText } from './ddl'
import { createStepRecord, partOf, recordSteps, stepRecorded } from './step-record'
import type { RenderedStep } from './steps/render'
import type { StoreNames } from './store-names'

// The text a migration file of the project holds: each statement ends with a semicolon, a blank line between them.

/** The statements as SQL text. */
export const statementsSql = (statements: RawBuilder<unknown>[]) => statements.map((statement) => `${ddlText(statement)};`).join('\n\n')

const comment = ({ module, step, on }: RenderedStep) => `-- ${module} ${step.step} ${step.name}${on === undefined ? '' : `, on the tables of ${on}`}: ${step.title}.`

// The statements of a part, then the row that records it in `auth_steps`.
const partStatements = (names: StoreNames, part: RenderedStep) => [...part.statements, recordSteps(names, [partOf(part)])]

/** The rendered steps, each under a comment naming it, each followed by the row that records it in `auth_steps`. */
export const stepsSql = (names: StoreNames, rendered: RenderedStep[]) => rendered.map((part) => `${comment(part)}\n${statementsSql(partStatements(names, part))}`).join('\n\n')

// The dollar quotes of a guarded part: its block, and each statement it executes.
const blockQuote = '$step$'
const statementQuote = '$statement$'

/** The statements as one block that runs them only while `when` holds, each executed as text. */
export const guardedBlock = (when: RawBuilder<unknown>, statements: RawBuilder<unknown>[]) => {
  const texts = statements.map(ddlText)
  const quoted = texts.find((text) => text.includes(blockQuote) || text.includes(statementQuote))
  if (quoted) throw new Error(`A step's statement holds ${blockQuote} or ${statementQuote}, which guard it: ${quoted}`)
  return `do ${blockQuote} begin\nif ${ddlText(when)} then\n${texts.map((text) => `execute ${statementQuote}${text}${statementQuote};`).join('\n')}\nend if;\nend ${blockQuote};`
}

/**
 * The rendered steps as `stepsSql` writes them, each part run only while `auth_steps` lacks it, so a database that has
 * it already, such as one `protobase-serve migrate-release` brought to a release, skips it.
 */
export const guardedStepsSql = (names: StoreNames, rendered: RenderedStep[]) =>
  rendered.map((part) => `${comment(part)}\n${guardedBlock(ddl`not ${stepRecorded(names, part)}`, partStatements(names, part))}`).join('\n\n')

/** The record of the store's steps, for a store that has none yet, in the store's schema, made when it is missing. */
export const stepRecordSql = (names: StoreNames) => {
  const schema = names.schema === undefined ? [] : [ddl`create schema if not exists ${names.schema}`]
  return `-- The record of the auth store's steps.\n${statementsSql([...schema, createStepRecord(names)])}`
}
