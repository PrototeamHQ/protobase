import { askDir } from './ask-dir'
import { askTables, tableMenu, withReferenced, type DatabaseTable } from './ask-tables'
import { askYesNo } from './ask-yes-no'
import { databaseNextSteps, type Tools } from './next-steps'

// `npm create protobase <database-url>`: its questions and steps, in order. It reaches the filesystem, the network and
// the database only through the `DatabaseSteps` it is given, so the website can run it in a page with those mocked.

/** A terminal: `ask` asks a question and resolves to the answer, and is missing without one. */
export type Terminal = { ask?: (text: string) => Promise<string>; print: (text: string) => void }

/** What becomes of the tables: `tables` become resources, the `excluded` do not, each written as schema.table or schema. */
export type ImportChoices = {
  tables: string[]
  excluded: string[]
  // Whether each resource gets a ui.ts with its names and list too.
  ui: boolean
  // Whether the field proposed for each column is asked about, as `protobase scaffold` asks it, or accepted.
  review: boolean
}

/** The package manager that installs the new project's packages. */
export type PackageManager = 'bun' | 'npm'

/** Everything the wizard does besides asking and printing. */
export type DatabaseSteps = {
  // Connects, read-only, and names the database and the server's version; fails when it cannot connect.
  checkConnection: (url: string) => Promise<{ database: string; version: string }>
  // Writes the scratch preset to `dir`, on the database at `url`; fails when `dir` is not empty.
  writeProject: (dir: string, url: string) => Promise<void>
  install: (dir: string, manager: PackageManager) => Promise<void>
  // The tables of the database the project's `protobase scaffold` writes resources over, and those it leaves out, each
  // with why; on a Supabase database, the platform's schemas it has, auth among them, which are Supabase's.
  listTables: (dir: string, url: string) => Promise<{ tables: DatabaseTable[]; skipped: string[]; supabaseSchemas: string[] }>
  // Signs the project in on Supabase's auth.users, as `protobase import supabase` does, which prints the files it writes.
  useSupabaseUsers: (dir: string) => Promise<void>
  // Runs the project's `protobase scaffold` on the choices, which prints the files it writes.
  importTables: (dir: string, url: string, choices: ImportChoices) => Promise<void>
  tools: Tools
}

const keyOf = (table: DatabaseTable) => `${table.schema}.${table.name}`

// The host, port and database of `url`, never its password.
const where = (url: URL) => `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`

// Which tables become resources and how: without a terminal, every table with a ui.ts and no questions.
const askChoices = async (tables: DatabaseTable[], terminal: Terminal): Promise<ImportChoices> => {
  const keys = tables.map(keyOf)
  const { ask, print } = terminal
  if (!ask) return { tables: keys, excluded: [], ui: true, review: false }
  const answered = await askTables(tables, ask, print)
  const picked = withReferenced(tables, answered)
  const added = picked.filter((key) => !answered.includes(key))
  if (added.length > 0) print(`  and ${added.join(', ')}, which they point to\n`)
  const ui = await askYesNo(ask, 'Write a ui.ts for each too, with its names and list?', true)
  const review = await askYesNo(ask, 'Review the field proposed for each column?', false)
  return { tables: picked, excluded: keys.filter((key) => !picked.includes(key)), ui, review }
}

/**
 * Creates a project on the existing database at `url`, in `dir` or the folder it asks for: checks the connection, writes
 * the scratch preset on that database and installs it, then asks which tables become resources, and how, and scaffolds
 * them with the project's own CLI. It only reads the database; the next steps it prints say which one writes to it.
 */
export const createFromDatabase = async (url: string, dir: string | undefined, terminal: Terminal, steps: DatabaseSteps) => {
  const { ask, print } = terminal
  print(`Connecting to ${where(new URL(url))}, read-only...\n`)
  const { database, version } = await steps.checkConnection(url)
  print(`Connected to ${database}, PostgreSQL ${version}.\n\n`)

  const folder = dir ?? (ask ? await askDir(ask, database) : database)
  await steps.writeProject(folder, url)
  const manager: PackageManager = steps.tools.bun ? 'bun' : 'npm'
  print(`\nWrote the project to ${folder}. Installing its packages with ${manager}...\n`)
  await steps.install(folder, manager)

  const { tables, skipped, supabaseSchemas } = await steps.listTables(folder, url)
  const supabase = supabaseSchemas.length > 0
  if (supabase) {
    print(`\n${database} is a Supabase database: the project signs in on Supabase's own auth.users.\n`)
    await steps.useSupabaseUsers(folder)
  }
  if (tables.length === 0) {
    print(`\n${database} has no tables to import${skipped.length > 0 ? `: it leaves out ${skipped.join(', ')}` : ''}. The project starts without resources.\n`)
  } else {
    print(tableMenu(database, tables, skipped))
    const choices = await askChoices(tables, terminal)
    // Supabase's schemas are excluded by name, since scaffold would otherwise take auth for Protobase's auth store.
    await steps.importTables(folder, url, { ...choices, excluded: [...choices.excluded, ...supabaseSchemas] })
  }
  print(`\nCreated a Protobase project in ${folder} on the database ${database}, which it has only read. Next:\n\n${databaseNextSteps(folder, steps.tools, supabase)}`)
}
