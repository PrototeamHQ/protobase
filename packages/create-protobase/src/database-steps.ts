import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'
import { createProject } from './create-project'
import type { DatabaseSteps, PackageManager } from './database-wizard'
import type { DatabaseTable } from './ask-tables'
import type { Tools } from './next-steps'
import type { ProcessTerminal } from './terminal'

// The scaffold's answer for each column, which only the CLI reads.
type Decide = (...args: never[]) => Promise<unknown>

/**
 * What `npm create protobase <database-url>` uses of `@protobase/cli/scaffold`, the scaffold command as functions, loaded
 * from the project it writes; it is no dependency of this package, so its shape is written out here.
 */
export type ScaffoldModule = {
  listTables(url: string): Promise<{ tables: DatabaseTable[]; skipped: string[]; supabaseSchemas: string[] }>
  runScaffold(
    options: { url: string; configDir: string; yes: boolean; dryRun: boolean; ui: ('names' | 'list')[]; excludes: string[]; decide?: Decide },
    out: (text: string) => void,
  ): Promise<unknown>
  asking(ask: (text: string) => Promise<string>, write: (text: string) => void): Decide
  useSupabaseUsers(projectDir: string, out: (text: string) => void): Promise<void>
}

// The `@protobase/cli/scaffold` the project in `dir` installed, so its tables are imported by the CLI that runs it.
const projectScaffold = async (dir: string): Promise<ScaffoldModule> => {
  const entry = createRequire(path.resolve(dir, 'package.json')).resolve('@protobase/cli/scaffold')
  return import(pathToFileURL(entry).href)
}

const checkConnection = async (url: string) => {
  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {}, connection: { default_transaction_read_only: true } })
  try {
    const [row] = await sql<{ database: string; version: string }[]>`select current_database() as database, current_setting('server_version') as version`
    return row!
  } finally {
    await sql.end()
  }
}

const install = (dir: string, manager: PackageManager) =>
  new Promise<void>((resolve, reject) => {
    // npm is npm.cmd on Windows, which only a shell runs.
    const child = spawn(manager, ['install'], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' })
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${manager} install failed in ${dir}`))))
  })

export type DatabaseStepsOptions = {
  // The scratch preset's template.
  templateDir: string
  secret: string
  tools: Tools
  // The terminal the column review asks on; `closePrompt` lets go of it while the install runs.
  terminal: ProcessTerminal
  // Where the project's scaffold comes from: the CLI it installed, unless a test hands it another.
  loadScaffold?: (dir: string) => Promise<ScaffoldModule>
}

/** The steps of `createFromDatabase` on this machine: its folders, its package manager and the database. */
export const databaseSteps = ({ templateDir, secret, tools, terminal, loadScaffold = projectScaffold }: DatabaseStepsOptions): DatabaseSteps => ({
  checkConnection,
  writeProject: async (dir, url) => {
    createProject(templateDir, path.resolve(dir), { secret, database: { url } })
  },
  install: async (dir, manager) => {
    terminal.closePrompt()
    await install(dir, manager)
  },
  listTables: async (dir, url) => (await loadScaffold(dir)).listTables(url),
  useSupabaseUsers: async (dir) => (await loadScaffold(dir)).useSupabaseUsers(path.resolve(dir), terminal.print),
  importTables: async (dir, url, { excluded, ui, review }) => {
    if (review && !terminal.ask) throw new Error('reviewing each column needs a terminal')
    const scaffold = await loadScaffold(dir)
    const decide = review && terminal.ask ? scaffold.asking(terminal.ask, terminal.print) : undefined
    await scaffold.runScaffold(
      { url, configDir: path.join(dir, 'config'), yes: !review, dryRun: false, ui: ui ? ['names', 'list'] : [], excludes: excluded, ...(decide && { decide }) },
      terminal.print,
    )
  },
  tools,
})
