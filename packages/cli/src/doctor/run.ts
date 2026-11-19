import pg from 'pg'
import { tableIndexes } from '@protobase/query'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readOnlyDb } from '../db/read-only-db'
import { openAppDatabase } from '../project/pg-db'
import { builtInIndexIssues } from './built-in-models'
import { checkResource } from './check'
import { fileIndexIssues, indexIssues } from './index-issues'
import { formatIssue, loadDoctorProject, unplannedNotes } from './project'
import { readShapes } from './read-shapes'
import { relationIssues } from './relation-issues'
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

export const runDoctor = async (options: DoctorOptions, out: (text: string) => void) => {
  const project = await loadDoctorProject(options.configDir, options.projectDir)
  const { config, source, builtIn } = project
  const sql = connect(options.url)
  const tables = await introspect(sql, { views: true }).finally(() => sql.end())
  const db = readOnlyDb(options.url)
  const userTables = userTablesOn(source) ? await userTableModels(db, [...builtIn.models, ...config.models]) : { models: [], issues: [] }
  const models = [...builtIn.models, ...config.models, ...userTables.models]
  const shapes = readShapes({ models, views: [...builtIn.views, ...config.views], pages: config.pages })
  const indexes = await Promise.all(
    models.map(async (model) => {
      const table = await tableIndexes(db, model)
      return [...indexIssues(model, table, shapes), ...fileIndexIssues(model, table)]
    }),
  )
    .then((found) => found.map((issues, i) => (i < builtIn.models.length ? builtInIndexIssues(issues) : issues)))
    .finally(() => db.destroy())
  const issues = [...userTables.issues, ...models.flatMap((model, i) => [...checkResource(model, tables), ...relationIssues(model, models), ...sortIssues(model, shapes), ...indexes[i]!])]
  for (const issue of issues) out(formatIssue(issue))
  for (const note of unplannedNotes(project, models)) out(note)
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
