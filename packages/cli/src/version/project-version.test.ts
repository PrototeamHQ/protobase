import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePackage } from '../../tests/support/packages'
import { checkProjectVersion, projectProtobaseVersion } from './project-version'

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

  it('runs a project whose caret range holds the CLI, and outside a project', async () => {
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
    for (const version of ['0.14.0', '0.14.2']) {
      await writePackage(dir, { name: '@protobase/cli', version })
      expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
    }
    for (const version of ['1.0.0', '1.2.0', '1.2.3']) {
      await writePackage(dir, { name: '@protobase/cli', version })
      expect(() => checkProjectVersion(dir, '1.2.3')).not.toThrow()
    }
  })

  it('refuses a project of another minor below 1.0, naming both versions and the range to use', async () => {
    for (const version of ['0.13.9', '0.15.0']) {
      await writePackage(dir, { name: '@protobase/cli', version })
      expect(() => checkProjectVersion(dir, '0.14.2')).toThrow(`This project is on Protobase ${version}, and this CLI is Protobase 0.14.2: run it with a Protobase ^${version} CLI`)
    }
  })

  it('refuses a project of another major, or one newer than the CLI', async () => {
    await writePackage(dir, { name: '@protobase/cli', version: '1.2.0' })
    expect(() => checkProjectVersion(dir, '0.14.2')).toThrow('This project is on Protobase 1.2.0, and this CLI is Protobase 0.14.2: run it with a Protobase ^1.2.0 CLI')
    expect(() => checkProjectVersion(dir, '2.0.0')).toThrow('This project is on Protobase 1.2.0, and this CLI is Protobase 2.0.0: run it with a Protobase ^1.2.0 CLI')
    expect(() => checkProjectVersion(dir, '1.1.9')).toThrow('run it with a Protobase ^1.2.0 CLI')
  })
})
