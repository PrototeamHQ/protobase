import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { authOf, cleanProjects, migrate, newProject } from './project-fixture'
import { readSnapshot } from './snapshot-file'
import { upgradeSnapshot } from './up'

afterEach(cleanProjects)

const withFormat = async (format: number) => {
  const dir = await newProject()
  await writeFile(path.join(dir, 'protobase.snapshot.json'), JSON.stringify({ format }))
  return dir
}

describe('protobase migration up', () => {
  it("leaves a snapshot in this version's format as it is", async () => {
    const dir = await newProject()
    await migrate(dir, authOf())
    expect(await upgradeSnapshot(dir)).toBe('protobase.snapshot.json is format 1 already')
  })

  it('refuses a newer format, as does every command that reads it', async () => {
    const dir = await withFormat(2)
    await expect(upgradeSnapshot(dir)).rejects.toThrow('protobase.snapshot.json is format 2, which a newer Protobase wrote; this one reads format 1: upgrade Protobase')
    await expect(readSnapshot(dir)).rejects.toThrow('which a newer Protobase wrote')
  })

  it('refuses a format no version wrote, which other commands send here', async () => {
    const dir = await withFormat(0)
    await expect(readSnapshot(dir)).rejects.toThrow('protobase.snapshot.json is format 0; this Protobase reads format 1: run `protobase migration up`')
    await expect(upgradeSnapshot(dir)).rejects.toThrow('protobase.snapshot.json is format 0, which no version of Protobase wrote')
  })

  it('refuses without a snapshot', async () => {
    await expect(upgradeSnapshot(await newProject())).rejects.toThrow('The project has no protobase.snapshot.json')
  })
})
