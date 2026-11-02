import { existsSync } from 'node:fs'
import path from 'node:path'
import { tableIndexes } from '@protobase/query'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readOnlyDb } from '../db/read-only-db'
import { loadSourceConfig } from '../config/source-config'
import { loadDataConfig } from '../project/load-data-config'
import { builtInModels } from './built-in-models'
import { checkResource, type Issue } from './check'
import { indexIssues } from './index-issues'
import { readShapes } from './read-shapes'
import { relationIssues } from './relation-issues'
import { sortIssues } from './sort-issues'

export type DoctorOptions = {
  url: string
  configDir: string
  projectDir: string
}

const format = (issue: Issue) =>
  `  ${issue.severity.padEnd(7)} ${issue.resource}: ${issue.message}${issue.suggestion ? `\n          fix: ${issue.suggestion}` : ''}\n`

export const runDoctor = async (options: DoctorOptions, out: (text: string) => void) => {
  if (!existsSync(path.join(options.configDir, 'index.ts'))) {
    throw new Error(`No config in ${options.configDir}: write it with \`protobase scaffold\`, or pass --config <dir>`)
  }
  const config = await loadDataConfig(options.configDir, options.projectDir)
  if (config.models.length === 0) throw new Error(`No resources exported from ${options.configDir}/index.ts`)
  const builtIn = builtInModels(await loadSourceConfig(options.projectDir, { command: 'tool' }), config.models)
  const models = [...builtIn.models, ...config.models]
  const sql = connect(options.url)
  const tables = await introspect(sql, { views: true }).finally(() => sql.end())
  const db = readOnlyDb(options.url)
  const shapes = readShapes({ models, views: [...builtIn.views, ...config.views], pages: config.pages })
  const indexes = await Promise.all(models.map(async (model) => indexIssues(model, await tableIndexes(db, model), shapes))).finally(() => db.destroy())
  const issues = models.flatMap((model, i) => [...checkResource(model, tables), ...relationIssues(model, models), ...sortIssues(model, shapes), ...indexes[i]!])
  for (const issue of issues) out(format(issue))
  const errors = issues.filter((i) => i.severity === 'error').length
  const checked = builtIn.models.length > 0 ? `${config.models.length} resources and ${builtIn.models.length} built-in ones` : `${models.length} resources`
  out(`Checked ${checked}: ${errors} errors, ${issues.length - errors} warnings.\n`)
  return { errors, warnings: issues.length - errors }
}
