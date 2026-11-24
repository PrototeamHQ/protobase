import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { settingsStoreNames } from '@protobase/server/internal'
import type { AuthTarget } from './auth-target'
import { runMigration } from './run-migration'
import { modelHash, readSnapshot, writeSnapshot } from './snapshot-file'

// Projects in temporary folders for the snapshot's tests, migrated without a database.

const dirs: string[] = []

/** A new empty project folder; `cleanProjects` removes them. */
export const newProject = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-snapshot-'))
  dirs.push(dir)
  return dir
}

export const cleanProjects = () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))

/** A default organization, and the role of the users there already, as a config with organizations gives them. */
export const testOrganizations = { default: { id: 'main', name: 'Main', slug: 'main' }, existingUsersRole: 'sales' }

/** The auth store a config with these `auth` settings asks for, with `testOrganizations` once organizations are on. */
export const authOf = (settings: Parameters<typeof settingsStoreNames>[0] = {}, organizationsOn = false): AuthTarget => ({
  names: settingsStoreNames(settings),
  organizationsOn,
  organizations: organizationsOn ? testOrganizations : undefined,
})

/** Ids in order, as the same run gives the same ones. */
export const counterIds = () => {
  let next = 0
  return () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`
}

export const migrationsOf = (projectDir: string) => path.join(projectDir, 'db/migrations')

/** `protobase migration` without a database, in `projectDir`. */
export const migrate = (projectDir: string, auth: AuthTarget | undefined, newId = counterIds(), protobaseVersion = '1.0.0') =>
  runMigration({ projectDir, dir: migrationsOf(projectDir), auth, modules: [], database: undefined, protobaseVersion, newId })

/** Every file of the project's migrations and its snapshot, by path, with its text. */
export const projectFiles = async (projectDir: string) => {
  const migrations = existsSync(migrationsOf(projectDir)) ? await readdir(migrationsOf(projectDir)) : []
  const names = [...migrations.map((file) => `db/migrations/${file}`), ...(await readdir(projectDir)).filter((file) => file.endsWith('.json'))]
  return Object.fromEntries(await Promise.all(names.sort().map(async (name) => [name, await readFile(path.join(projectDir, name), 'utf8')] as const)))
}

/**
 * A project an older Protobase migrated, which shipped the auth module's steps up to `step`: its first migration and
 * snapshot as that version would have left them.
 */
export const olderProject = async (step: number) => {
  const dir = await newProject()
  await migrate(dir, authOf())
  const snapshot = (await readSnapshot(dir))!
  const model = structuredClone(snapshot.model)
  model.auth!.modules.auth!.lastStep = step
  await writeSnapshot(dir, { ...snapshot, model, modelHash: modelHash(model) })
  const first = path.join(migrationsOf(dir), '001_auth.sql')
  await writeFile(first, (await readFile(first, 'utf8')).replace('auth=5', `auth=${step}`).replace(snapshot.modelHash, modelHash(model)))
  return dir
}
