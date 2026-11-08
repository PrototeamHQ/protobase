import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeFingerprint } from '@protobase/server/mobile-release'
import { afterEach, expect, it, vi } from 'vitest'
import { bundleMobile } from '../build/bundle-mobile'
import { buildConfigBundle } from '../build/config-bundle'
import type { Extension } from '../project/extensions'
import { loadMobileProject } from './load-project'
import { pinnedNative } from './pinned-packages'

// Each test bundles the config, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const root = path.resolve(__dirname, '../../../..')

// Inside tests/apps/erp, so the bundle's @protobase imports resolve.
let dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  dirs = []
})
const folder = async (config: string) => {
  const dir = path.join(root, 'tests/apps/erp', `.push-test-${randomBytes(4).toString('hex')}`)
  dirs.push(dir)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'protobase.config.ts'), config)
  return dir
}

const mobile = "mobile: { appId: 'net.example.shop' }"
const onFor = (command: string) => `export default ({ command }: { command: string }) => ({ ${mobile}, ...(command === '${command}' && { notifications: {} }) })\n`

// The push and fingerprint of the binary `protobase mobile` builds, and of the release a host fingerprints from the
// manifest of the bundle built from the same project.
const bothProducers = async (dir: string, extensions: Extension[] = []) => {
  const binary = await loadMobileProject(dir, extensions)
  const bundle = await buildConfigBundle({ projectDir: dir, outFile: path.join(dir, 'out', 'server.js'), extensions })
  const manifest = bundleMobile(bundle.mobile, bundle.notifications)!
  return {
    binary: { push: binary.notifications, fingerprint: nativeFingerprint(pinnedNative, {}, { push: binary.notifications }) },
    manifest: { push: manifest.push, fingerprint: nativeFingerprint(pinnedNative, manifest.plugins, { push: manifest.push }) },
  }
}

it('gives the binary and the manifest the same push for a config function on for build only', async () => {
  const { binary, manifest } = await bothProducers(await folder(onFor('build')))
  expect(binary.push).toBe(true)
  expect(manifest).toEqual(binary)
})

it('gives both push off for a config function on for other commands only', async () => {
  const { binary, manifest } = await bothProducers(await folder(onFor('tool')))
  expect(binary.push).toBe(false)
  expect(manifest).toEqual(binary)
})

it('gives both the push an extension turns on for build', async () => {
  const project = await folder(`export default { ${mobile} }\n`)
  const extension = await folder(onFor('build').replace(`${mobile}, `, ''))
  const { binary, manifest } = await bothProducers(project, [{ dir: extension, config: path.join(extension, 'protobase.config.ts') }])
  expect(binary.push).toBe(true)
  expect(manifest).toEqual(binary)
})

it('gives both push on for a config object with notifications()', async () => {
  const { binary, manifest } = await bothProducers(await folder(`export default { ${mobile}, notifications: {} }\n`))
  expect(binary.push).toBe(true)
  expect(manifest).toEqual(binary)
})
