import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appPluginsCommand, nativeWebDirs } from './app-plugins-hook'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// A workspace after Capacitor copied the web part without its plugins/, as it does, and the hook ran for `platform`.
const afterCopy = (platform: string, withPlugins = true) => {
  ws = mkdtempSync(path.join(tmpdir(), 'protobase-app-plugins-'))
  write(path.join(ws, 'web', 'index.html'), '<!doctype html>')
  if (withPlugins) {
    write(path.join(ws, 'web', 'plugins', 'app', 'plugin.json'), '{"name":"app"}')
    write(path.join(ws, 'web', 'plugins', 'app', 'assets', 'index.js'), 'export default {}')
  }
  for (const dir of Object.values(nativeWebDirs)) write(path.join(ws, dir, 'index.html'), '<!doctype html>')
  execSync(appPluginsCommand, { cwd: ws, env: { ...process.env, CAPACITOR_PLATFORM_NAME: platform } })
}

describe('appPluginsCommand', () => {
  it.each(Object.entries(nativeWebDirs))('copies the app\'s plugins back into the %s files', (platform, dir) => {
    afterCopy(platform)
    expect(readFileSync(path.join(ws, dir, 'plugins', 'app', 'plugin.json'), 'utf8')).toBe('{"name":"app"}')
    expect(existsSync(path.join(ws, dir, 'plugins', 'app', 'assets', 'index.js'))).toBe(true)
  })

  it('leaves the other platform\'s files alone', () => {
    afterCopy('ios')
    expect(existsSync(path.join(ws, nativeWebDirs.android, 'plugins'))).toBe(false)
  })

  it('does nothing for an app without plugins or for the web platform', () => {
    afterCopy('ios', false)
    expect(existsSync(path.join(ws, nativeWebDirs.ios, 'plugins'))).toBe(false)
    rmSync(ws, { recursive: true, force: true })
    afterCopy('web')
    for (const dir of Object.values(nativeWebDirs)) expect(existsSync(path.join(ws, dir, 'plugins'))).toBe(false)
  })
})
