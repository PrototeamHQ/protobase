import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePackage } from '../../../tests/support/packages'
import { packageTree } from './package-tree'

describe('packageTree', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-tree-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const layout = async (names: string[]) => (await packageTree(await Promise.all(names.map(async (name) => ({ name, dir: path.join(dir, 'node_modules', name) }))))).map((pkg) => [pkg.dest, pkg.json.version])

  it('puts the imported packages and their dependencies at the top', async () => {
    await writePackage(dir, { name: 'addon', dependencies: { 'node-gyp-build': '^4' } })
    await writePackage(dir, { name: 'node-gyp-build', version: '4.8.4' })
    expect(await layout(['addon'])).toEqual([
      ['addon', '1.0.0'],
      ['node-gyp-build', '4.8.4'],
    ])
  })

  it('nests a second version under the package that needs it', async () => {
    const a = await writePackage(dir, { name: 'a', dependencies: { shared: '^1' } })
    const b = await writePackage(dir, { name: 'b', dependencies: { shared: '^2' } })
    await writePackage(a, { name: 'shared', version: '1.0.0' })
    await writePackage(b, { name: 'shared', version: '2.0.0' })
    expect(await layout(['a', 'b'])).toEqual([
      ['a', '1.0.0'],
      ['b', '1.0.0'],
      ['shared', '1.0.0'],
      ['b/node_modules/shared', '2.0.0'],
    ])
  })

  it('places a package that depends on itself in a cycle once', async () => {
    await writePackage(dir, { name: 'a', dependencies: { b: '1' } })
    await writePackage(dir, { name: 'b', dependencies: { a: '1' } })
    expect(await layout(['a'])).toEqual([
      ['a', '1.0.0'],
      ['b', '1.0.0'],
    ])
  })

  it('skips optional dependencies that are not installed and refuses missing required ones', async () => {
    await writePackage(dir, { name: 'addon', optionalDependencies: { absent: '1' } })
    expect(await layout(['addon'])).toEqual([['addon', '1.0.0']])
    await writePackage(dir, { name: 'broken', dependencies: { absent: '1' } })
    await expect(layout(['broken'])).rejects.toThrow('absent, which broken needs, is not installed')
  })

  it('leaves out platform packages for no target, as a package manager on linux would', async () => {
    const optionalDependencies = { 'addon-linux-x64-gnu': '1', 'addon-linux-x64-musl': '1', 'addon-darwin-arm64': '1', 'addon-win32-x64': '1' }
    await writePackage(dir, { name: 'addon', optionalDependencies })
    await writePackage(dir, { name: 'addon-linux-x64-gnu', os: ['linux'], cpu: ['x64'], libc: ['glibc'] })
    await writePackage(dir, { name: 'addon-linux-x64-musl', os: ['linux'], cpu: ['x64'], libc: ['musl'] })
    await writePackage(dir, { name: 'addon-darwin-arm64', os: ['darwin'], cpu: ['arm64'] })
    await writePackage(dir, { name: 'addon-win32-x64', os: ['!linux', '!darwin'] })
    expect(await layout(['addon'])).toEqual([
      ['addon', '1.0.0'],
      ['addon-linux-x64-gnu', '1.0.0'],
    ])
  })
})
