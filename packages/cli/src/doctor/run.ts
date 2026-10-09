import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { checkResource, type Issue } from './check'
import { loadResourceModels } from './load-config'

export type DoctorOptions = {
  url: string
  configDir: string
}

const format = (issue: Issue) =>
  `  ${issue.severity.padEnd(7)} ${issue.resource}: ${issue.message}${issue.suggestion ? `\n          fix: ${issue.suggestion}` : ''}\n`

export const runDoctor = async (options: DoctorOptions, out: (text: string) => void) => {
  const models = await loadResourceModels(options.configDir)
  if (models.length === 0) throw new Error(`No resources exported from ${options.configDir}/index.ts`)
  const sql = connect(options.url)
  const tables = await introspect(sql).finally(() => sql.end())
  const issues = models.flatMap((model) => checkResource(model, tables))
  for (const issue of issues) out(format(issue))
  const errors = issues.filter((i) => i.severity === 'error').length
  out(`Checked ${models.length} resources: ${errors} errors, ${issues.length - errors} warnings.\n`)
  return { errors, warnings: issues.length - errors }
}
