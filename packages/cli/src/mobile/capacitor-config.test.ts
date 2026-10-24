import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { capacitorConfig, writeCapacitorConfig } from './capacitor-config'

const base = {
  appId: 'com.example.shop',
  appName: 'Shop',
  fingerprint: '0123456789abcdef',
  plugins: [],
  allowances: { cleartext: false, mixedContent: false },
  apiOrigin: 'https://shop.example.com',
  platform: 'android' as const,
}

describe('capacitorConfig', () => {
  it('names the app, its files and fingerprint, and compiles in the keyboard plugin and Protobase\'s alone', () => {
    expect(capacitorConfig(base)).toEqual({
      appId: 'com.example.shop',
      appName: 'Shop',
      webDir: 'web',
      appendUserAgent: 'ProtobaseNative/0123456789abcdef',
      includePlugins: ['@capacitor/keyboard', '@protobase/mobile'],
      plugins: { ProtobaseAuth: { apiOrigin: 'https://shop.example.com', origin: 'https://localhost' }, Keyboard: { autoBackdropColor: 'dom' } },
      android: { resolveServiceWorkerRequests: false },
    })
  })

  it('compiles in the configured plugins, and Protobase\'s after them', () => {
    expect(capacitorConfig({ ...base, plugins: ['@capacitor/camera', 'x'] }).includePlugins).toEqual(['@capacitor/camera', 'x', '@capacitor/keyboard', '@protobase/mobile'])
  })

  it.each([
    ['android', 'https://localhost'],
    ['ios', 'capacitor://localhost'],
  ] as const)('gives ProtobaseAuth the API and the Capacitor origin of %s', (platform, origin) => {
    expect(capacitorConfig({ ...base, platform, apiOrigin: 'http://localhost:3000' }).plugins.ProtobaseAuth).toEqual({ apiOrigin: 'http://localhost:3000', origin })
  })

  it('allows plain http for an http API, and mixed content for the emulator\'s host, never service workers on the local server', () => {
    const { server, android, ...common } = capacitorConfig(base)
    expect(capacitorConfig({ ...base, allowances: { cleartext: true, mixedContent: false } })).toEqual({ ...common, server: { cleartext: true }, android: { resolveServiceWorkerRequests: false } })
    expect(capacitorConfig({ ...base, allowances: { cleartext: true, mixedContent: true } })).toEqual({
      ...common,
      server: { cleartext: true },
      android: { resolveServiceWorkerRequests: false, allowMixedContent: true },
    })
  })
})

describe('writeCapacitorConfig', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes capacitor.config.json and removes the configs Capacitor would read instead', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-cap-config-'))
    writeFileSync(path.join(dir, 'capacitor.config.ts'), "export default { server: { url: 'https://evil.example.com' } }")
    writeFileSync(path.join(dir, 'capacitor.config.js'), 'module.exports = {}')
    await writeCapacitorConfig(dir, capacitorConfig(base))
    expect(existsSync(path.join(dir, 'capacitor.config.ts'))).toBe(false)
    expect(existsSync(path.join(dir, 'capacitor.config.js'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(dir, 'capacitor.config.json'), 'utf8'))).toEqual(capacitorConfig(base))
  })
})
