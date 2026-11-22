import { spawnSync } from 'node:child_process'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkMigrations } from './check'
import { writeCustomMigration } from './custom'
import { authOf, cleanProjects, counterIds, migrate, migrationsOf, olderProject } from './project-fixture'

afterEach(cleanProjects)

const git = (dir: string, ...args: string[]) => spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })

const commit = (dir: string, message: string) => {
  git(dir, 'add', '-A')
  expect(git(dir, 'commit', '-q', '-m', message).status).toBe(0)
}

describe('two branches that each write a migration', () => {
  it('conflict on the snapshot, and regenerating on the second gives one correct file on top', { timeout: 30_000 }, async () => {
    const dir = await olderProject(3)
    git(dir, 'init', '-q', '-b', 'main')
    commit(dir, 'base')

    // One branch adds a migration of its own; the other upgrades Protobase, whose newer auth steps it writes.
    git(dir, 'checkout', '-q', '-b', 'orders')
    await writeCustomMigration({ projectDir: dir, dir: migrationsOf(dir), name: 'orders', recordConfig: false, auth: authOf(), protobaseVersion: '1.0.0', newId: () => 'orders-id' })
    commit(dir, 'orders')
    git(dir, 'checkout', '-q', 'main')
    git(dir, 'checkout', '-q', '-b', 'upgrade')
    await migrate(dir, authOf(), counterIds(), '1.1.0')
    commit(dir, 'upgrade')

    const merge = git(dir, 'merge', 'orders')
    expect(merge.status).not.toBe(0)
    expect(merge.stdout).toContain('CONFLICT (content): Merge conflict in protobase.snapshot.json')
    await expect(migrate(dir, authOf(), counterIds(), '1.1.0')).rejects.toThrow('protobase.snapshot.json has a merge conflict')

    await rm(path.join(migrationsOf(dir), '002_auth.sql'))
    git(dir, 'checkout', 'orders', '--', 'protobase.snapshot.json')
    const file = await migrate(dir, authOf(), counterIds(), '1.1.0')
    expect(path.basename(file!)).toBe('003_auth.sql')
    expect((await readdir(migrationsOf(dir))).sort()).toEqual(['001_auth.sql', '002_orders.sql', '003_auth.sql'])
    expect(await checkMigrations(dir, migrationsOf(dir), authOf())).toEqual([])
  })
})
