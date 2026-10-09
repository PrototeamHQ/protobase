import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { elfBinary, machoBinary } from '../../../tests/support/native-binaries'
import { prebuildifyFiles, writePackage } from '../../../tests/support/packages'
import { copyPackages } from './copy-packages'
import { packageFiles } from './package-dir'

describe('copyPackages', () => {
  let dir = ''
  let out = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-copy-'))
    out = path.join(dir, 'dist/node_modules')
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const copy = (...names: string[]) => copyPackages(names.map((name) => ({ name, dir: path.join(dir, 'node_modules', name) })), out)

  it('copies a prebuilt add-on and its dependencies with the linux glibc binaries only', async () => {
    await writePackage(dir, { name: 'addon', dependencies: { 'node-gyp-build': '^4' } }, prebuildifyFiles)
    await writePackage(dir, { name: 'node-gyp-build' }, { 'node-gyp-build.js': '' })
    await copy('addon')

    expect((await packageFiles(path.join(out, 'addon'))).sort()).toEqual([
      'binding.gyp',
      'index.js',
      'package.json',
      'prebuilds/linux-arm64/addon.glibc.node',
      'prebuilds/linux-x64/addon.glibc.node',
    ])
    expect(await readFile(path.join(out, 'addon/prebuilds/linux-arm64/addon.glibc.node'))).toEqual(elfBinary('arm64'))
    expect((await packageFiles(path.join(out, 'node-gyp-build'))).sort()).toEqual(['index.js', 'node-gyp-build.js', 'package.json'])
  })

  it('refuses an add-on compiled for the build machine, before writing anything', async () => {
    await writePackage(dir, { name: 'compiled', version: '5.1.1' }, { 'binding.gyp': '{}', 'build/Release/compiled.node': machoBinary('arm64') })
    await writePackage(dir, { name: 'addon' }, prebuildifyFiles)
    const refusal = copy('addon', 'compiled')
    await expect(refusal).rejects.toThrow('Native add-ons need binaries for linux-x64 and linux-arm64 (glibc), linking only what the run image or the bundle has:')
    await expect(refusal).rejects.toThrow('compiled 5.1.1: no add-on for linux-x64 or linux-arm64 (found darwin-arm64)')
    expect(existsSync(out)).toBe(false)
  })

  it('refuses an add-on that has binaries for one architecture only, or none at all', async () => {
    await writePackage(dir, { name: 'x64-only' }, { 'build/Release/addon.node': elfBinary('x64') })
    await expect(copy('x64-only')).rejects.toThrow('x64-only 1.0.0: no add-on for linux-arm64 (found linux-x64)')
    await writePackage(dir, { name: 'musl-only' }, { 'prebuilds/linux-x64/a.node': elfBinary('x64', 'musl'), 'prebuilds/linux-arm64/a.node': elfBinary('arm64', 'musl') })
    await expect(copy('musl-only')).rejects.toThrow('musl-only 1.0.0: no add-on for linux-x64 or linux-arm64 (found linux-arm64-musl, linux-x64-musl)')
    await writePackage(dir, { name: 'unbuilt' }, { 'binding.gyp': '{}' })
    await expect(copy('unbuilt')).rejects.toThrow('unbuilt 1.0.0: no add-on for linux-x64 or linux-arm64 (found none)')
  })

  it('refuses a binary that links a library neither the run image nor the bundle has', async () => {
    const files = { 'prebuilds/linux-x64/a.node': elfBinary('x64', 'glibc', ['libvips.so.42']), 'prebuilds/linux-arm64/a.node': elfBinary('arm64') }
    await writePackage(dir, { name: 'linked' }, files)
    await expect(copy('linked')).rejects.toThrow('linked 1.0.0: prebuilds/linux-x64/a.node needs libvips.so.42, which neither the run image nor the bundle has')
  })

  it('accepts a library the bundle carries, in the package or a dependency', async () => {
    const files = { 'prebuilds/linux-x64/a.node': elfBinary('x64', 'glibc', ['libvips.so.42']), 'prebuilds/linux-arm64/a.node': elfBinary('arm64', 'glibc', ['libvips.so.42']) }
    await writePackage(dir, { name: 'linked', dependencies: { 'linked-libs': '1' } }, files)
    await writePackage(dir, { name: 'linked-libs' }, { 'lib/libvips.so.42': elfBinary('x64') })
    expect((await copy('linked')).map((pkg) => pkg.dest)).toEqual(['linked', 'linked-libs'])
  })

  describe('an add-on in per-platform packages', () => {
    const optionalDependencies = { 'split-linux-x64-gnu': '1', 'split-linux-arm64-gnu': '1', 'split-darwin-arm64': '1' }

    beforeEach(async () => {
      await writePackage(dir, { name: 'split', optionalDependencies })
      await writePackage(dir, { name: 'split-darwin-arm64', os: ['darwin'], cpu: ['arm64'] }, { 'split.darwin-arm64.node': machoBinary('arm64') })
    })

    it('refuses it when only the build machine\'s package is installed', async () => {
      await expect(copy('split')).rejects.toThrow('split 1.0.0: no add-on for linux-x64 or linux-arm64 (found darwin-arm64)')
    })

    it('copies the linux packages when they are installed, and not the others', async () => {
      await writePackage(dir, { name: 'split-linux-x64-gnu', os: ['linux'], cpu: ['x64'], libc: ['glibc'] }, { 'split.linux-x64-gnu.node': elfBinary('x64') })
      await writePackage(dir, { name: 'split-linux-arm64-gnu', os: ['linux'], cpu: ['arm64'], libc: ['glibc'] }, { 'split.linux-arm64-gnu.node': elfBinary('arm64') })
      const tree = await copy('split')
      expect(tree.map((pkg) => pkg.dest)).toEqual(['split', 'split-linux-x64-gnu', 'split-linux-arm64-gnu'])
      expect(existsSync(path.join(out, 'split-linux-arm64-gnu/split.linux-arm64-gnu.node'))).toBe(true)
      expect(existsSync(path.join(out, 'split-darwin-arm64'))).toBe(false)
    })
  })
})
