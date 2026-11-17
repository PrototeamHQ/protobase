import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { tableIndexes } from '@protobase/query'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readOnlyDb } from '../db/read-only-db'
import { loadSourceConfig } from '../config/source-config'
import { loadDataConfig } from '../project/load-data-config'
import { openAppDatabase } from '../project/pg-db'
import { builtInIndexIssues, builtInModels } from './built-in-models'
import { checkResource, type Issue } from './check'
import { indexIssues } from './index-issues'
import { unplannedBlocks } from './page-shapes'
import { readShapes } from './read-shapes'
import { relationIssues } from './relation-issues'
import { checkResourceCount } from './resource-count'
import { sortIssues } from './sort-issues'
import { checkServerStartup } from './startup'
import { userTableModels } from './user-table-models'
import { userTablesOn } from '../config/user-tables-config'

export type DoctorOptions = {
  url: string
  configDir: string
  projectDir: string
  /** Also run the server's startup checks once the config passes (`checkServerStartup`), as the `doctor` command does. */
  startupChecks?: boolean
}

const format = (issue: Issue) =>
  `  ${issue.severity.padEnd(7)} ${issue.resource}: ${issue.message}${issue.suggestion ? `\n          fix: ${issue.suggestion}` : ''}\n`

export const runDoctor = async (options: DoctorOptions, out: (text: string) => void) => {
  if (!existsSync(path.join(options.configDir, 'index.ts'))) {
    throw new Error(`No config in ${options.configDir}: write it with \`protobase scaffold\`, or pass --config <dir>`)
  }
  const config = await loadDataConfig(options.configDir, options.projectDir)
  const source = await loadSourceConfig(options.projectDir, { command: 'tool' })
  checkResourceCount(config.models.length, source.resources, `${options.configDir}/index.ts`)
  const builtIn = builtInModels(source, config.models)
  const sql = connect(options.url)
  const tables = await introspect(sql, { views: true }).finally(() => sql.end())
  const db = readOnlyDb(options.url)
  const userTables = userTablesOn(source) ? await userTableModels(db, [...builtIn.models, ...config.models]) : { models: [], issues: [] }
  const models = [...builtIn.models, ...config.models, ...userTables.models]
  const shapes = readShapes({ models, views: [...builtIn.views, ...config.views], pages: config.pages })
  const indexes = await Promise.all(models.map(async (model) => indexIssues(model, await tableIndexes(db, model), shapes)))
    .then((found) => found.map((issues, i) => (i < builtIn.models.length ? builtInIndexIssues(issues) : issues)))
    .finally(() => db.destroy())
  const issues = [...userTables.issues, ...models.flatMap((model, i) => [...checkResource(model, tables), ...relationIssues(model, models), ...sortIssues(model, shapes), ...indexes[i]!])]
  for (const issue of issues) out(format(issue))
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  for (const block of config.pages.flatMap((page) => unplannedBlocks(page, byName))) out(`  note    ${block} declares no reads, so it is outside the page's read plan and reads whatever it reads once it draws\n`)
  const errors = issues.filter((i) => i.severity === 'error').length
  // Only a project that passes the checks above can be built as the server builds it; a refusal ends the run with the
  // server's own message. These checks are of the app `serve` runs, from the project's own config, not of `--config`:
  // the server never reads another folder.
  const startup = options.startupChecks === true && errors === 0
  if (startup) {
    const database = openAppDatabase(pg, options.url)
    await checkServerStartup(source, database).finally(() => database.db.destroy())
  }
  const counted = userTables.models.length > 0 ? `${config.models.length} resources, ${userTables.models.length} user tables` : `${config.models.length} resources`
  const checked = builtIn.models.length > 0 ? `${counted} and ${builtIn.models.length} built-in ones` : counted
  out(`Checked ${checked}${startup ? ' and the server\'s startup checks' : ''}: ${errors} errors, ${issues.length - errors} warnings.\n`)
  return { errors, warnings: issues.length - errors, issues }
}
