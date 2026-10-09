import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readExistingResources } from './existing-config'
import { planScaffold, type FileChange } from './plan'
import { acceptAll, interactive } from './prompt'
import { parseTarget } from './targets'
import type { UiSection } from './ui-file'

export type ScaffoldOptions = {
  url: string
  target?: string
  configDir: string
  yes: boolean
  dryRun: boolean
  ui: UiSection[]
  excludes: string[]
}

const readText = (file: string) =>
  readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })

const write = async ({ path: file, after }: FileChange) => {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, after)
}

export const runScaffold = async (options: ScaffoldOptions, out: (text: string) => void) => {
  if (!options.yes && !process.stdin.isTTY) {
    throw new Error('Interactive scaffolding needs a terminal; pass --yes to accept all proposals')
  }
  const sql = connect(options.url)
  const prompter = options.yes ? undefined : interactive()
  const plan = await (async () => {
    try {
      return await planScaffold({
        tables: await introspect(sql),
        existing: await readExistingResources(options.configDir),
        configDir: options.configDir,
        target: parseTarget(options.target),
        excludes: options.excludes,
        decide: prompter?.decide ?? acceptAll,
        ui: options.ui,
        readText,
      })
    } finally {
      prompter?.close()
      await sql.end()
    }
  })()

  for (const change of plan.changes) {
    if (options.dryRun) out(createTwoFilesPatch(change.path, change.path, change.before ?? '', change.after))
    else await write(change)
  }
  for (const change of plan.changes) {
    if (!options.dryRun) out(`${change.before === undefined ? 'created' : 'updated'} ${change.path}\n`)
  }
  if (plan.changes.length === 0) out('Nothing to do, config is up to date.\n')
  else if (options.dryRun) out(`${plan.changes.length} file(s) would change; nothing was written (--dry-run).\n`)
  for (const warning of plan.warnings) out(`warning: ${warning}\n`)
  if (plan.drift.length > 0) {
    out('\nDrift:\n')
    for (const d of plan.drift) out(`  ${d.resource}.${d.field}: ${d.problem}\n    suggested: ${d.suggestion}\n`)
  }
  return plan
}
