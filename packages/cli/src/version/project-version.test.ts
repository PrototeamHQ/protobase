import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePackage } from '../../tests/support/packages'
import { checkProjectMajor, projectProtobaseVersion } from './project-version'

describe('project versions', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-project-version-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("reads the version the project's install pinned, from @protobase/cli or else another @protobase package", async () => {
    expect(projectProtobaseVersion(dir)).toBeUndefined()
    await writePackage(dir, { name: '@protobase/server', version: '0.9.1' })
    expect(projectProtobaseVersion(dir)).toBe('0.9.1')
    await writePackage(dir, { name: '@protobase/cli', version: '0.9.2' })
    expect(projectProtobaseVersion(path.join(dir, 'config'))).toBe('0.9.2')
  })

  it('runs a project of its own major, whatever its minor, and outside a project', async () => {
    expect(() => checkProjectMajor(dir, '0.14.2')).not.toThrow()
    for (const version of ['0.1.0', '0.13.9', '0.14.2', '0.99.0']) {
      await writePackage(dir, { name: '@protobase/cli', version })
      expect(() => checkProjectMajor(dir, '0.14.2')).not.toThrow()
    }
  })

  it('refuses a project of another major, naming both versions', async () => {
    await writePackage(dir, { name: '@protobase/cli', version: '1.2.0' })
    expect(() => checkProjectMajor(dir, '0.14.2')).toThrow('This project is on Protobase 1.2.0, and this CLI is Protobase 0.14.2: run it with a Protobase 1.x CLI')
    expect(() => checkProjectMajor(dir, '2.0.0')).toThrow('This project is on Protobase 1.2.0, and this CLI is Protobase 2.0.0: run it with a Protobase 1.x CLI')
  })
})
