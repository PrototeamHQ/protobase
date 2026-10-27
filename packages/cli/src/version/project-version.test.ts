import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  const manifest = (fields: object) => writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', ...fields }))

  it("reads the version the project's install pinned, from @protobase/cli or else another @protobase package", async () => {
    expect(projectProtobaseVersion(dir)).toBeUndefined()
    await writePackage(dir, { name: '@protobase/server', version: '0.9.1' })
    expect(projectProtobaseVersion(dir)).toBe('0.9.1')
    await writePackage(dir, { name: '@protobase/cli', version: '0.9.2' })
    expect(projectProtobaseVersion(path.join(dir, 'config'))).toBe('0.9.2')
  })

  it('runs outside a project, and in one whose package.json lists no @protobase package, whatever is installed', async () => {
    await writePackage(dir, { name: '@protobase/cli', version: '0.13.0' })
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
    await manifest({ dependencies: { react: '^19.0.0' } })
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
  })

  it('runs a project whose specifier holds the CLI, in dependencies or devDependencies', async () => {
    for (const field of ['dependencies', 'devDependencies']) {
      for (const specifier of ['^0.14.0', '~0.14.2', '0.14.2', '>=0.12.0 <1']) {
        await manifest({ [field]: { '@protobase/cli': specifier, '@protobase/server': specifier } })
        expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
      }
    }
  })

  it('refuses a project whose specifier does not hold the CLI, naming both', async () => {
    for (const specifier of ['^0.13.0', '0.14.1', '^0.15.0', '^1.0.0']) {
      await manifest({ devDependencies: { '@protobase/server': specifier } })
      expect(() => checkProjectVersion(dir, '0.14.2')).toThrow(`This project asks for Protobase ${specifier}, and this CLI is Protobase 0.14.2: run it with a CLI whose version ${specifier} holds`)
    }
  })

  it('refuses @protobase packages listed at different specifiers, naming them', async () => {
    await manifest({ dependencies: { '@protobase/server': '^0.14.0' }, devDependencies: { '@protobase/cli': '^0.14.1' } })
    expect(() => checkProjectVersion(dir, '0.14.2')).toThrow('lists @protobase/server at ^0.14.0 and @protobase/cli at ^0.14.1; list every @protobase package at the same version')
  })

  it("refuses a locked project's installed copies outside the caret range of the CLI, below 1.0 another minor", async () => {
    await manifest({ dependencies: { '@protobase/server': '>=0.12.0 <1' } })
    await writePackage(dir, { name: '@protobase/server', version: '0.13.9' })
    expect(() => checkProjectVersion(dir, '0.14.2')).toThrow('This project has Protobase 0.13.9 installed, and this CLI is Protobase 0.14.2: run it with a Protobase ^0.13.9 CLI')
    await writePackage(dir, { name: '@protobase/server', version: '0.14.0' })
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
  })

  it('leaves the installed copies of a bundled project unchecked: the CLI runs its own', async () => {
    await manifest({ devDependencies: { '@protobase/server': '>=0.12.0 <1' } })
    await writePackage(dir, { name: '@protobase/server', version: '0.13.9' })
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
  })

  it('checks only the installed copies for a specifier that is no range, such as workspace:*', async () => {
    await manifest({ dependencies: { '@protobase/server': 'workspace:*' } })
    expect(() => checkProjectVersion(dir, '0.14.2')).not.toThrow()
    await writePackage(dir, { name: '@protobase/server', version: '1.2.0' })
    expect(() => checkProjectVersion(dir, '0.14.2')).toThrow('This project has Protobase 1.2.0 installed, and this CLI is Protobase 0.14.2: run it with a Protobase ^1.2.0 CLI')
  })
})
