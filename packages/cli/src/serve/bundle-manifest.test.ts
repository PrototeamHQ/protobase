import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundleManifest } from './bundle-manifest'

describe('checkBundleManifest', () => {
  let dir = ''
  const configFile = () => path.join(dir, 'protobase.config.js')
  const manifestFile = () => path.join(dir, 'protobase.bundle.json')

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-bundle-manifest-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('accepts a bundle of any Protobase version, or none', async () => {
    for (const manifest of [{ version: 3, protobase: '0.1.4' }, { version: 3, protobase: '0.99.0' }, { version: 3, protobase: '1.0.0' }, { version: 3 }]) {
      await writeFile(manifestFile(), JSON.stringify(manifest))
      expect(() => checkBundleManifest(configFile())).not.toThrow()
    }
  })

  it('refuses a config module without a manifest beside it', () => {
    expect(() => checkBundleManifest(configFile())).toThrow(`${manifestFile()} is missing; serve the config module of a bundle folder from \`protobase build\``)
  })
})
