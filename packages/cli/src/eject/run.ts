import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { userTablesSchema } from '@protobase/server/config-exports'
import { nextMigrationName } from '../auth/migration-file'
import { runDoctor } from '../doctor/run'
import { camelCase } from '../infer/names'
import { readExistingResources } from '../scaffold/existing-config'
import { ensureExports } from '../scaffold/index-file'
import type { FileChange } from '../scaffold/plan'
import { viewName } from '../scaffold/ui-file'
import { ejectFiles } from './eject-files'
import { readEjected } from './read-ejected'
import { tableMigration } from './table-migration'

export type EjectOptions = {
  url: string
  // The names of the tables users added, as their definitions name them.
  names: string[]
  configDir: string
  migrationsDir: string
  projectDir: string
}

const readText = (file: string) =>
  readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })

const readNames = (dir: string) =>
  readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })

const migrationText = (tables: string[], statements: string[]) =>
  `-- The tables users added that \`protobase eject\` took over as code: ${tables.join(', ')}.\n-- Where they were added this changes nothing and moves no row; on an empty database it makes them, without their rows.\n\n${statements.join('\n\n')}\n`

// Each name once, never one a resource in code has or whose table one reads already.
const checkNames = async ({ names, configDir }: EjectOptions) => {
  if (names.length === 0) throw new Error('Name the tables to eject')
  const twice = names.find((name, i) => names.indexOf(name) !== i)
  if (twice) throw new Error(`"${twice}" is named twice`)
  const existing = await readExistingResources(configDir)
  for (const name of names) {
    const owner = existing.find((resource) => resource.name === name || resource.table === `${userTablesSchema}.${name}`)
    if (owner) throw new Error(`"${name}" is a resource in code already, in ${path.join(owner.dir, 'data.ts')}`)
  }
}

// The new files of each table, refused where one is there already, and config/index.ts exporting them.
const configChanges = async (options: EjectOptions, files: Array<{ name: string; data: string; ui: string }>) => {
  const changes: FileChange[] = []
  for (const { name, data, ui } of files) {
    for (const [file, after] of [[path.join(options.configDir, name, 'data.ts'), data], [path.join(options.configDir, name, 'ui.ts'), ui]] as const) {
      if ((await readText(file)) !== undefined) throw new Error(`${file} exists already`)
      changes.push({ path: file, after })
    }
  }
  const index = path.join(options.configDir, 'index.ts')
  const before = await readText(index)
  const registrations = files.flatMap(({ name }) => [{ from: `./${name}/data`, names: [camelCase(name)] }, { from: `./${name}/ui`, names: [viewName(camelCase(name))] }])
  changes.push({ path: index, ...(before !== undefined && { before }), after: ensureExports(before ?? '', registrations) })
  return changes
}

// Writes the file, and returns the first folder it made for it, if any.
const write = async ({ path: file, before, after }: FileChange) => {
  const made = await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, after, { flag: before === undefined ? 'wx' : 'w' })
  return made
}

// Puts every file back as it was: a new one removed, a changed one written as it was, and the folders made for them removed.
const rollBack = async (changes: FileChange[], folders: string[]) => {
  for (const { path: file, before } of changes) {
    if (before === undefined) await rm(file, { force: true })
    else await writeFile(file, before)
  }
  for (const folder of folders.reverse()) await rm(folder, { recursive: true, force: true })
}

/**
 * Takes tables users added over as code: writes each one's config/<name>/data.ts and ui.ts, exports them from
 * config/index.ts, and writes one migration that makes the tables as they are, then runs doctor on the config. When
 * doctor finds an error in an ejected resource, or cannot run, every file is put back as it was and it stops. It only
 * reads the database.
 */
export const runEject = async (options: EjectOptions, out: (text: string) => void) => {
  await checkNames(options)
  const tables = await readEjected(options.url, options.names)
  const config = await configChanges(options, tables.map(({ ejected }) => ({ name: ejected.definition.name, ...ejectFiles(ejected) })))
  const migration = path.join(options.migrationsDir, nextMigrationName(await readNames(options.migrationsDir), `eject_${options.names.join('_')}`))
  const statements = tables.flatMap(({ ejected, ddl }) => tableMigration(ejected.table, ddl))
  const changes = [...config, { path: migration, after: migrationText(options.names.map((name) => `${userTablesSchema}.${name}`), statements) }]

  const folders: string[] = []
  for (const change of changes) {
    const made = await write(change)
    if (made) folders.push(made)
  }
  const shown = (file: string) => path.relative(options.projectDir, file)
  for (const change of changes) out(`${change.before === undefined ? 'created' : 'updated'} ${shown(change.path)}\n`)

  const report = await runDoctor({ url: options.url, configDir: options.configDir, projectDir: options.projectDir }, out).catch(async (error: unknown) => {
    await rollBack(changes, folders)
    throw error
  })
  const errors = report.issues.filter((issue) => issue.severity === 'error' && options.names.includes(issue.resource))
  if (errors.length > 0) {
    await rollBack(changes, folders)
    throw new Error(`doctor found ${errors.length} error${errors.length === 1 ? '' : 's'} in the ejected ${errors.length === 1 ? 'resource' : 'resources'}, so every file is as it was`)
  }
  out(`\nDeploy this soon: until it serves, the admin app still adds fields to ${options.names.join(', ')}. Once it has deployed, \`protobase migration\` writes the delete of ${options.names.length === 1 ? 'its definition' : 'their definitions'}.\n`)
}
