import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundleLayout, isApiPath, manifestFile, parseManifest, readManifest } from './manifest'

describe('isApiPath', () => {
  it('matches a prefix and the paths below it, not a longer segment', () => {
    const api = ['/api']
    expect(isApiPath(api, '/api')).toBe(true)
    expect(isApiPath(api, '/api/meta')).toBe(true)
    expect(isApiPath(api, '/api/v1:batchWrite')).toBe(true)
    expect(isApiPath(api, '/apiary')).toBe(false)
    expect(isApiPath(api, '/orders/api')).toBe(false)
  })

  it("sends a bundle's OAuth discovery documents to the API, the resource's own below its prefix too", () => {
    expect(isApiPath(bundleLayout.api, '/.well-known/oauth-authorization-server')).toBe(true)
    expect(isApiPath(bundleLayout.api, '/.well-known/oauth-protected-resource/api/mcp')).toBe(true)
    expect(isApiPath(bundleLayout.api, '/.well-known/openid-configuration')).toBe(false)
  })
})

describe('parseManifest', () => {
  const plugin = { name: 'app', path: 'plugins/app/plugin.json', api: 1, protobase: '>=0.12.0' }
  const shell = { protobase: '0.12.0', pluginApi: 1, paths: ['/index.html', '/assets'] }
  const manifest = { version: 3, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'], plugins: [plugin], theme: 'protobase.theme.css', shell }

  it('accepts a version 3 manifest, with or without node_modules and migrations', () => {
    expect(parseManifest(manifest, 'm.json')).toEqual(manifest)
    expect(parseManifest({ ...manifest, plugins: [] }, 'm.json')).toEqual({ ...manifest, plugins: [] })
    expect(parseManifest({ ...manifest, nodeModules: 'node_modules' }, 'm.json')).toEqual({ ...manifest, nodeModules: 'node_modules' })
    expect(parseManifest({ ...manifest, migrations: 'migrations' }, 'm.json')).toEqual({ ...manifest, migrations: 'migrations' })
  })

  it('refuses another version and missing or malformed fields', () => {
    expect(() => parseManifest({ ...manifest, version: 2 }, 'm.json')).toThrow('m.json is not a version 3 bundle manifest; rebuild it with `protobase build`')
    expect(() => parseManifest(null, 'm.json')).toThrow('not a version 3 bundle manifest')
    expect(() => parseManifest({ ...manifest, api: '/api' }, 'm.json')).toThrow('m.json needs server, public, spa and theme paths and an api list')
    expect(() => parseManifest({ ...manifest, plugins: [{ ...plugin, api: '1' }] }, 'm.json')).toThrow('m.json needs a plugins list, each with a name, path, api and protobase')
    expect(() => parseManifest({ ...manifest, shell: { ...shell, paths: '/assets' } }, 'm.json')).toThrow('m.json needs a shell with its protobase version, pluginApi and paths')
    expect(() => parseManifest({ ...manifest, nodeModules: true }, 'm.json')).toThrow('m.json has a nodeModules that is no path')
    expect(() => parseManifest({ ...manifest, migrations: ['001.sql'] }, 'm.json')).toThrow('m.json has a migrations that is no path')
  })

  it('reads protobase.bundle.json from a bundle folder', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'protobase-manifest-'))
    await writeFile(path.join(dir, manifestFile), JSON.stringify(manifest))
    expect(await readManifest(dir)).toEqual(manifest)
    await rm(dir, { recursive: true, force: true })
  })
})
