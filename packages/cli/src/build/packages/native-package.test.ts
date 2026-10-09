import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { machoBinary } from '../../../tests/support/native-binaries'
import { prebuildifyFiles, writePackage } from '../../../tests/support/packages'
import { isNativePackage } from './native-package'

describe('isNativePackage', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-native-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('is false for plain JavaScript', async () => {
    expect(await isNativePackage(await writePackage(dir, { name: 'plain' }, { 'lib/util.js': '' }))).toBe(false)
  })

  it('finds an add-on file, or the binding.gyp that builds one on install', async () => {
    expect(await isNativePackage(await writePackage(dir, { name: 'prebuilt' }, prebuildifyFiles))).toBe(true)
    expect(await isNativePackage(await writePackage(dir, { name: 'compiled' }, { 'build/Release/addon.node': machoBinary('arm64') }))).toBe(true)
    expect(await isNativePackage(await writePackage(dir, { name: 'unbuilt' }, { 'binding.gyp': '{}' }))).toBe(true)
  })

  it('counts add-ons in per-platform optional packages, not an optional extra for another platform', async () => {
    const optionalDependencies = { 'split-linux-x64-gnu': '1', 'split-darwin-arm64': '1' }
    await writePackage(dir, { name: 'split-darwin-arm64', os: ['darwin'], cpu: ['arm64'] }, { 'split.node': machoBinary('arm64') })
    expect(await isNativePackage(await writePackage(dir, { name: 'split', optionalDependencies }))).toBe(true)

    await writePackage(dir, { name: 'fsevents', os: ['darwin'] }, { 'fsevents.node': machoBinary('arm64') })
    expect(await isNativePackage(await writePackage(dir, { name: 'watcher', optionalDependencies: { fsevents: '2' } }))).toBe(false)
  })

  it('ignores add-ons of packages installed inside it', async () => {
    const outer = await writePackage(dir, { name: 'outer' })
    await writePackage(outer, { name: 'inner' }, { 'inner.node': machoBinary('arm64') })
    expect(await isNativePackage(outer)).toBe(false)
  })
})
