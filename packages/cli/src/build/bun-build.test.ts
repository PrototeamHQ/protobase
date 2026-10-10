import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bunBuild } from './bun-build'

describe('bunBuild', () => {
  const originalPath = process.env.PATH
  let dir = ''
  afterEach(async () => {
    process.env.PATH = originalPath
    await rm(dir, { recursive: true, force: true })
  })

  it('fails naming Bun as a requirement when there is no bun on PATH', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-no-bun-'))
    process.env.PATH = dir
    await expect(bunBuild(path.join(dir, 'in.js'), path.join(dir, 'out.js'))).rejects.toThrow('--bun needs Bun to write the bundle')
  })
})
