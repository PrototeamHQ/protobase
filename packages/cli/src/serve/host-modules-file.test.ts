import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hostModuleIds } from './host-module-ids'
import { hostModulesFileName, writeHostModulesFile } from './host-modules-file'

describe('writeHostModulesFile', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const written = async (ids?: readonly string[]) => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-host-modules-'))
    await writeHostModulesFile(dir, ids)
    return JSON.parse(await readFile(path.join(dir, hostModulesFileName), 'utf8'))
  }

  it('writes exactly the host modules', async () => {
    expect(await written()).toEqual([...hostModuleIds])
  })

  it('writes a module added to the list', async () => {
    expect(await written([...hostModuleIds, 'some-package'])).toEqual([...hostModuleIds, 'some-package'])
  })
})
