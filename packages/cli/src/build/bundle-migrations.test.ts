import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigrations } from './bundle-migrations'

describe('copyMigrations', () => {
  let dir: string

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("copies the project's db/migrations/*.sql only and names the bundle's folder", async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-migrations-'))
    const migrations = path.join(dir, 'project/db/migrations')
    await mkdir(path.join(migrations, 'drafts'), { recursive: true })
    await writeFile(path.join(migrations, '001_things.sql'), 'create table things ();\n')
    await writeFile(path.join(migrations, '002_auth.sql'), 'create schema auth;\n')
    await writeFile(path.join(migrations, 'README.md'), 'notes\n')
    await writeFile(path.join(migrations, 'drafts/003_draft.sql'), 'select 1;\n')
    const outDir = path.join(dir, 'dist')

    expect(await copyMigrations({ projectDir: path.join(dir, 'project'), outDir })).toBe('migrations')
    expect((await readdir(path.join(outDir, 'migrations'))).sort()).toEqual(['001_things.sql', '002_auth.sql'])
    expect(await readFile(path.join(outDir, 'migrations/001_things.sql'), 'utf8')).toBe('create table things ();\n')
  })

  it('copies nothing for a project without db/migrations', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-migrations-'))
    expect(await copyMigrations({ projectDir: dir, outDir: path.join(dir, 'dist') })).toBeUndefined()
    expect(await readdir(dir)).toEqual([])
  })
})
