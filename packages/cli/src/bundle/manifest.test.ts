import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isApiPath, manifestFile, parseManifest, readManifest } from './manifest'

describe('isApiPath', () => {
  it('matches a prefix and the paths below it, not a longer segment', () => {
    const api = ['/api']
    expect(isApiPath(api, '/api')).toBe(true)
    expect(isApiPath(api, '/api/meta')).toBe(true)
    expect(isApiPath(api, '/api/v1:batchWrite')).toBe(true)
    expect(isApiPath(api, '/apiary')).toBe(false)
    expect(isApiPath(api, '/orders/api')).toBe(false)
  })
})

describe('parseManifest', () => {
  const manifest = { version: 2, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'] }

  it('accepts a version 2 manifest, with or without node_modules', () => {
    expect(parseManifest(manifest, 'm.json')).toEqual(manifest)
    expect(parseManifest({ ...manifest, nodeModules: 'node_modules' }, 'm.json')).toEqual({ ...manifest, nodeModules: 'node_modules' })
  })

  it('refuses another version and missing or malformed fields', () => {
    expect(() => parseManifest({ ...manifest, version: 1 }, 'm.json')).toThrow('m.json is not a version 2 bundle manifest; rebuild it with `protobase build`')
    expect(() => parseManifest(null, 'm.json')).toThrow('not a version 2 bundle manifest')
    expect(() => parseManifest({ ...manifest, api: '/api' }, 'm.json')).toThrow('m.json needs server, public and spa paths and an api list')
    expect(() => parseManifest({ ...manifest, nodeModules: true }, 'm.json')).toThrow('m.json has a nodeModules that is no path')
  })

  it('reads protobase.bundle.json from a bundle folder', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'protobase-manifest-'))
    await writeFile(path.join(dir, manifestFile), JSON.stringify(manifest))
    expect(await readManifest(dir)).toEqual(manifest)
    await rm(dir, { recursive: true, force: true })
  })
})
