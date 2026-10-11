import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeMigrations } from './write-migrations'

const dirs: string[] = []
const folder = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-migrations-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const part = (name: string, sql: string | undefined | Error) => ({
  name,
  title: `The ${name} changes`,
  sql: async () => {
    if (sql instanceof Error) throw sql
    return sql
  },
})

describe('writeMigrations', () => {
  it('writes one numbered file per part that has statements, after the folder\'s migrations', async () => {
    const dir = await folder()
    await writeFile(path.join(dir, '007_orders.sql'), '')
    const files = await writeMigrations([part('auth', undefined), part('changes', 'create schema if not exists "changes";'), part('jobs', 'select 1;')], dir)
    expect(files.map((file) => path.basename(file))).toEqual(['008_changes.sql', '009_jobs.sql'])
    expect(await readFile(files[0]!, 'utf8')).toBe(
      "-- The changes changes, written by `protobase migration`.\n-- Applied with the project's other migrations; edit or remove statements the project handles differently.\n\ncreate schema if not exists \"changes\";\n",
    )
  })

  it('writes nothing, not even the folder, when the database is current', async () => {
    const dir = path.join(await folder(), 'db', 'migrations')
    expect(await writeMigrations([part('auth', undefined), part('changes', undefined)], dir)).toEqual([])
    await expect(readdir(dir)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('compares every part before writing any, so a failing one leaves no file', async () => {
    const dir = await folder()
    await expect(writeMigrations([part('auth', 'select 1;'), part('changes', new Error('no table'))], dir)).rejects.toThrow('no table')
    expect(await readdir(dir)).toEqual([])
  })
})
