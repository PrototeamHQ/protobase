import { existsSync } from 'node:fs'
import path from 'node:path'
import { tableIndexes } from '@protobase/query'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readOnlyDb } from '../db/read-only-db'
import { loadDataConfig } from '../project/load-data-config'
import { checkResource, type Issue } from './check'
import { indexIssues } from './index-issues'
import { readShapes } from './read-shapes'

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
  const { models } = config
  if (models.length === 0) throw new Error(`No resources exported from ${options.configDir}/index.ts`)
  const sql = connect(options.url)
  const tables = await introspect(sql, { views: true }).finally(() => sql.end())
  const db = readOnlyDb(options.url)
  const shapes = readShapes(config)
  const indexes = await Promise.all(models.map(async (model) => indexIssues(model, await tableIndexes(db, model), shapes))).finally(() => db.destroy())
  const issues = models.flatMap((model, i) => [...checkResource(model, tables), ...indexes[i]!])
  for (const issue of issues) out(format(issue))
  const errors = issues.filter((i) => i.severity === 'error').length
  out(`Checked ${models.length} resources: ${errors} errors, ${issues.length - errors} warnings.\n`)
  return { errors, warnings: issues.length - errors }
}
