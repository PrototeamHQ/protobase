import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadSourceConfig } from '../config/source-config'
import { loadDataConfig } from '../project/load-data-config'
import { builtInModels } from './built-in-models'
import type { Issue } from './check'
import { unplannedBlocks } from './page-shapes'

/** The config doctor checks, from `configDir`, the project's protobase.config.ts, and the resources Protobase adds by them. */
export const loadDoctorProject = async (configDir: string, projectDir: string) => {
  if (!existsSync(path.join(configDir, 'index.ts'))) {
    throw new Error(`No config in ${configDir}: write it with \`protobase scaffold\`, or pass --config <dir>`)
  }
  const config = await loadDataConfig(configDir, projectDir)
  if (config.models.length === 0) throw new Error(`No resources exported from ${configDir}/index.ts`)
  const source = await loadSourceConfig(projectDir, { command: 'tool' })
  return { config, source, builtIn: builtInModels(source, config.models) }
}

export type DoctorProject = Awaited<ReturnType<typeof loadDoctorProject>>

export const formatIssue = (issue: Issue) =>
  `  ${issue.severity.padEnd(7)} ${issue.resource}: ${issue.message}${issue.suggestion ? `\n          fix: ${issue.suggestion}` : ''}\n`

/** Each custom component of a page that declares no reads, as a note doctor does not count. */
export const unplannedNotes = ({ config }: DoctorProject, models: DoctorProject['config']['models']) => {
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  return config.pages.flatMap((page) => unplannedBlocks(page, byName)).map((block) => `  note    ${block} declares no reads, so it is outside the page's read plan and reads whatever it reads once it draws\n`)
}
