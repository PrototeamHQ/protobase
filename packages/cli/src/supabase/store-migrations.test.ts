import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { migrationText } from '../auth/migration-file'
import { writeCustomMigration } from '../migration/snapshot/custom'
import { authOf, cleanProjects, migrate, migrationsOf, newProject } from '../migration/snapshot/project-fixture'
import { snapshotFile } from '../migration/snapshot/snapshot-file'
import { authStoreMigrations, removeStoreMigrations } from './store-migrations'

afterEach(cleanProjects)

it('finds the migrations either command wrote for the auth schema, and none in a missing folder', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'store-migrations-'))
  await writeFile(path.join(dir, '001_auth.sql'), migrationText('create table "auth"."user" ("id" text);'))
  await writeFile(path.join(dir, '002_auth.sql'), '-- The auth schema changes this version of Protobase needs, written by `protobase migration`.\nselect 1;\n')
  await writeFile(path.join(dir, '003_auth_users.sql'), '-- Every user gets a row of the app.\nselect 1;\n')
  await writeFile(path.join(dir, '004_copied.sql'), '-- protobase:custom\n-- Copied from elsewhere:\n-- The auth schema changes this version of Protobase needs, written by `protobase migration`.\nselect 1;\n')
  await writeFile(path.join(dir, 'notes.md'), '-- The auth schema changes this version of Protobase needs, written by me.\n')
  expect(await authStoreMigrations(dir)).toEqual(['001_auth.sql', '002_auth.sql'])
  await rm(dir, { recursive: true })
  expect(await authStoreMigrations(dir)).toEqual([])
})

it('finds an auth migration under Protobase\'s header lines', async () => {
  const projectDir = await newProject()
  await migrate(projectDir, authOf())
  expect(await authStoreMigrations(migrationsOf(projectDir))).toEqual(['001_auth.sql'])
})

it('refuses, deleting nothing, when Protobase wrote a migration that stays after the auth store\'s', async () => {
  const projectDir = await newProject()
  await migrate(projectDir, authOf())
  await writeCustomMigration({ projectDir, dir: migrationsOf(projectDir), name: 'own', recordConfig: false, auth: authOf(), protobaseVersion: '1.0.0', newId: () => 'custom-id' })
  const dir = migrationsOf(projectDir)
  const before = (await readdir(dir)).sort()
  expect(before).toHaveLength(2)
  await expect(removeStoreMigrations(projectDir, dir, ['001_auth.sql'])).rejects.toThrow(`${before[1]} was written by \`protobase migration\``)
  expect((await readdir(dir)).sort()).toEqual(before)
  expect(existsSync(path.join(projectDir, snapshotFile))).toBe(true)
})

it('refuses, deleting nothing, when the auth migration Protobase wrote holds other features\' statements too', async () => {
  const projectDir = await newProject()
  await migrate(projectDir, authOf())
  const dir = migrationsOf(projectDir)
  const mixed = path.join(dir, '001_auth_jobs.sql')
  await rename(path.join(dir, '001_auth.sql'), mixed)
  await writeFile(mixed, `${await readFile(mixed, 'utf8')}\n-- The jobs schema this version of Protobase needs.\ncreate schema "jobs";\n`)
  expect(await authStoreMigrations(dir)).toEqual(['001_auth_jobs.sql'])
  await expect(removeStoreMigrations(projectDir, dir, ['001_auth_jobs.sql'])).rejects.toThrow("001_auth_jobs.sql holds other features' statements")
  expect(await readdir(dir)).toEqual(['001_auth_jobs.sql'])
  expect(existsSync(path.join(projectDir, snapshotFile))).toBe(true)
})
