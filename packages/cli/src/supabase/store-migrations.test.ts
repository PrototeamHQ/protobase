import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { migrationText } from '../auth/migration-file'
import { authStoreMigrations } from './store-migrations'

it('finds the migrations either command wrote for the auth schema, and none in a missing folder', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'store-migrations-'))
  await writeFile(path.join(dir, '001_auth.sql'), migrationText('create table "auth"."user" ("id" text);'))
  await writeFile(path.join(dir, '002_auth.sql'), '-- The auth schema changes this version of Protobase needs, written by `protobase migration`.\nselect 1;\n')
  await writeFile(path.join(dir, '003_auth_users.sql'), '-- Every user gets a row of the app.\nselect 1;\n')
  await writeFile(path.join(dir, 'notes.md'), '-- The auth schema changes this version of Protobase needs, written by me.\n')
  expect(await authStoreMigrations(dir)).toEqual(['001_auth.sql', '002_auth.sql'])
  await rm(dir, { recursive: true })
  expect(await authStoreMigrations(dir)).toEqual([])
})
