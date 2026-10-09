import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundleVersion } from './bundle-version'

describe('checkBundleVersion', () => {
  let dir = ''
  const configFile = () => path.join(dir, 'protobase.config.js')
  const manifestFile = () => path.join(dir, 'protobase.bundle.json')
  const writeManifest = (manifest: unknown) => writeFile(manifestFile(), JSON.stringify(manifest))

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-bundle-version-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('accepts a bundle whose manifest names a version the runtime serves', async () => {
    await writeManifest({ version: 2, protobase: '0.1.4' })
    await expect(checkBundleVersion(configFile(), '0.1.0')).resolves.toBeUndefined()
  })

  it('refuses another version, naming the manifest and both versions', async () => {
    await writeManifest({ version: 2, protobase: '0.2.0' })
    await expect(checkBundleVersion(configFile(), '0.1.0')).rejects.toThrow(
      `${manifestFile()}: the bundle was built by Protobase 0.2.0 and this runtime is Protobase 0.1.0, which serves bundles built by 0.1.x; rebuild the bundle with Protobase 0.1.x or serve it with a runtime of 0.2.x`,
    )
  })

  it('refuses a manifest without a version', async () => {
    await writeManifest({ version: 2 })
    await expect(checkBundleVersion(configFile(), '0.1.0')).rejects.toThrow(`${manifestFile()}: the bundle names no Protobase version`)
  })

  it('refuses a config module without a manifest beside it', async () => {
    await expect(checkBundleVersion(configFile(), '0.1.0')).rejects.toThrow(
      `${manifestFile()} is missing; serve the config module of a bundle folder from \`protobase build\``,
    )
  })
})
