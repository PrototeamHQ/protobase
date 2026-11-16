import { configExports } from '@protobase/server'
import { projectResources } from '../config/project-parts'
import { userTablesOn } from '../config/user-tables-config'
import { captureFileIssues } from './capture-files'
import { readMigrationSql } from './migration-sql'
import { formatIssue, loadDoctorProject, unplannedNotes } from './project'
import { readShapes } from './read-shapes'
import { relationIssues } from './relation-issues'
import { sortIssues } from './sort-issues'
import { checkServerBuild } from './startup'

/**
 * The checks `protobase doctor --without-database` makes from the project alone: relations and sorts against the
 * config, the change capture of the app `serve` runs against the project's migrations (`captureFileIssues`), and once
 * those pass, the server's build of the app (`checkServerBuild`), whose refusal ends the run with the server's message.
 * It lists the checks it skipped, which only a database answers.
 */
export const runDoctorWithoutDatabase = async (options: { configDir: string; projectDir: string }, out: (text: string) => void) => {
  const project = await loadDoctorProject(options.configDir, options.projectDir)
  const { config, source, builtIn } = project
  const models = [...builtIn.models, ...config.models]
  const shapes = readShapes({ models, views: [...builtIn.views, ...config.views], pages: config.pages })
  const served = configExports(await projectResources(source)).resources.map((resource) => resource.toModel())
  const capture = captureFileIssues(served, source.events, (await readMigrationSql(options.projectDir)) ?? '')
  const issues = [...models.flatMap((model) => [...relationIssues(model, models), ...sortIssues(model, shapes)]), ...capture.issues]
  for (const issue of issues) out(formatIssue(issue))
  for (const note of unplannedNotes(project, models)) out(note)
  const errors = issues.filter((i) => i.severity === 'error').length
  if (errors === 0) await checkServerBuild(source)
  const skipped = [
    'the tables, columns, types and keys of the resources, and the indexes their reads need',
    ...(userTablesOn(source) ? ['the tables users add'] : []),
    "the server's startup checks of the database's schemas, but for the change capture of the resources whose table a migration creates",
    ...(capture.unjudged.length > 0 ? [`the change capture of ${capture.unjudged.join(', ')}, whose table no migration creates`] : []),
  ]
  out(`Skipped without a database:\n${skipped.map((check) => `  ${check}\n`).join('')}`)
  const counted = builtIn.models.length > 0 ? `${config.models.length} resources and ${builtIn.models.length} built-in ones` : `${config.models.length} resources`
  out(`Checked ${counted}${errors === 0 ? ", and the server's build of the app," : ''} without a database: ${errors} errors, ${issues.length - errors} warnings.\n`)
  return { errors, warnings: issues.length - errors, issues, skipped }
}
