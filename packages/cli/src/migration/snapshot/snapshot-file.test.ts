import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanProjects, newProject } from './project-fixture'
import { readSnapshot } from './snapshot-file'

afterEach(cleanProjects)

describe('reading protobase.snapshot.json', () => {
  it('is nothing in a project without one', async () => {
    expect(await readSnapshot(await newProject())).toBeUndefined()
  })

  it('says how to resolve a merge conflict in it', async () => {
    const dir = await newProject()
    await writeFile(path.join(dir, 'protobase.snapshot.json'), '{\n<<<<<<< HEAD\n  "format": 1\n=======\n  "format": 1\n>>>>>>> other\n}\n')
    await expect(readSnapshot(dir)).rejects.toThrow("protobase.snapshot.json has a merge conflict: delete this branch's newest migration, take the other branch's protobase.snapshot.json, and run `protobase migration` again")
  })
})
