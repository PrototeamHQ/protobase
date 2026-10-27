import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readExistingResources } from './existing-config'
import { planScaffold, type FileChange } from './plan'
import type { ProtobaseSchema } from './protobase-tables'
import { acceptAll, interactive, type Decide } from './prompt'
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
  live?: string[]
  // Decides each column in place of the terminal prompt, as `npm create protobase <url>` does with its own.
  decide?: Decide
}

const readText = (file: string) =>
  readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })

// The auth store is never scaffolded; the job queue and the record of migrations are when the target names their schema.
const skippedLine = ({ schema, what, tables }: ProtobaseSchema) =>
  `skipped ${schema === 'public' ? tables.map((table) => `public.${table.name}`).join(', ') : `schema ${schema}`}, Protobase's ${what}${what !== 'auth store' ? `; pass "${schema}" as the target to scaffold it anyway` : ''}\n`

const write = async ({ path: file, after }: FileChange) => {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, after)
}

export const runScaffold = async (options: ScaffoldOptions, out: (text: string) => void) => {
  const asks = !options.yes && !options.decide
  if (asks && !process.stdin.isTTY) {
    throw new Error('Interactive scaffolding needs a terminal; pass --yes to accept all proposals')
  }
  const sql = connect(options.url)
  const prompter = asks ? interactive() : undefined
  const plan = await (async () => {
    try {
      return await planScaffold({
        tables: await introspect(sql, { views: true }),
        existing: await readExistingResources(options.configDir),
        configDir: options.configDir,
        target: parseTarget(options.target),
        excludes: options.excludes,
        live: options.live,
        decide: options.decide ?? prompter?.decide ?? acceptAll,
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
  for (const schema of plan.skipped) out(skippedLine(schema))
  for (const { table, by } of plan.referenced) out(`included ${table}, which ${by.join(', ')} ${by.length === 1 ? 'points' : 'point'} to\n`)
  for (const warning of plan.warnings) out(`warning: ${warning}\n`)
  if (plan.drift.length > 0) {
    out('\nDrift:\n')
    for (const d of plan.drift) out(`  ${d.resource}.${d.field}: ${d.problem}\n    suggested: ${d.suggestion}\n`)
  }
  return plan
}
