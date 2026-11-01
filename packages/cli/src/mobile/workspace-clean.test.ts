import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareWorkspace, workspacePackageJson } from './workspace'

let dir = ''
afterEach(() => {
  const modules = path.join(dir, 'project', 'ws', 'node_modules')
  if (existsSync(modules)) chmodSync(modules, 0o755)
  rmSync(dir, { recursive: true, force: true })
})

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// A workspace in `<dir>/project/ws`, @protobase/mobile at a version and a local plugin in `<dir>/project/plugin`
// pinning is-number at `pin`.
const setup = (pin: string) => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-clean-'))
  const ws = path.join(dir, 'project', 'ws')
  write(path.join(dir, 'project', 'plugin', 'package.json'), JSON.stringify({ name: 'my-plugin', dependencies: { 'is-number': pin } }))
  return ws
}
const packageJson = workspacePackageJson({ mobileSpec: '0.14.2', plugins: { 'my-plugin': '../plugin' } })
const installed = (ws: string, name: string, version: string) => write(path.join(ws, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))

// npm as it leaves the workspace, the root holding is-number at `version`, recording what it found before it ran.
const fakeNpm = (ws: string, version: string, seen: Array<{ args: string[]; modules: boolean; lock: boolean }>) => async (_command: string, args: string[]) => {
  seen.push({ args, modules: existsSync(path.join(ws, 'node_modules')), lock: existsSync(path.join(ws, 'package-lock.json')) })
  for (const name of ['@protobase/mobile', 'my-plugin']) installed(ws, name, '1.0.0')
  installed(ws, 'is-number', version)
  write(path.join(ws, 'package-lock.json'), '{}')
}

describe('prepareWorkspace with a local folder', () => {
  it('removes node_modules and the lock before npm runs when the folder\'s pins changed, and keeps them when not', async () => {
    const ws = setup('7.0.0')
    const seen: Array<{ args: string[]; modules: boolean; lock: boolean }> = []
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '7.0.0', seen))
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '7.0.0', seen))
    write(path.join(dir, 'project', 'plugin', 'package.json'), JSON.stringify({ dependencies: { 'is-number': '6.0.0' } }))
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '6.0.0', seen))
    expect(seen).toEqual([
      { args: ['install', '--install-links', '--no-audit', '--no-fund'], modules: false, lock: false },
      { args: ['install', '--install-links', '--no-audit', '--no-fund'], modules: true, lock: true },
      { args: ['install', '--install-links', '--no-audit', '--no-fund'], modules: false, lock: false },
    ])
  })

  it('refuses a pin the root still does not hold after npm, as when another package pins it otherwise', async () => {
    const ws = setup('6.0.0')
    await expect(prepareWorkspace(ws, packageJson, fakeNpm(ws, '7.0.0', []))).rejects.toThrow('is-number is pinned at 6.0.0 by my-plugin, but .protobase/mobile holds 7.0.0 at its root')
  })

  it('refuses a missing local folder before removing anything', async () => {
    const ws = setup('7.0.0')
    installed(ws, 'my-plugin', '1.0.0')
    const calls: string[][] = []
    const gone = workspacePackageJson({ mobileSpec: '0.14.2', plugins: { 'my-plugin': '../nowhere' } })
    await expect(prepareWorkspace(ws, gone, async (command, args) => void calls.push([command, ...args]))).rejects.toThrow('my-plugin is installed from a local folder whose package.json is missing')
    expect(existsSync(path.join(ws, 'node_modules', 'my-plugin', 'package.json'))).toBe(true)
    expect(calls).toEqual([])
  })

  it('removes only the links when node_modules or a copy is a link to a folder elsewhere', async () => {
    const ws = setup('6.0.0')
    const outside = path.join(dir, 'outside')
    write(path.join(outside, 'my-plugin', 'keep'), '')
    write(path.join(outside, 'modules', 'is-number', 'package.json'), JSON.stringify({ version: '7.0.0' }))
    mkdirSync(ws, { recursive: true })
    symlinkSync(path.join(outside, 'modules'), path.join(ws, 'node_modules'))
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '6.0.0', []))
    expect(readFileSync(path.join(outside, 'modules', 'is-number', 'package.json'), 'utf8')).toBe(JSON.stringify({ version: '7.0.0' }))
    rmSync(path.join(ws, 'node_modules', 'my-plugin'), { recursive: true })
    symlinkSync(path.join(outside, 'my-plugin'), path.join(ws, 'node_modules', 'my-plugin'))
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '6.0.0', []))
    expect(existsSync(path.join(outside, 'my-plugin', 'keep'))).toBe(true)
  })

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')('runs no npm when node_modules cannot be removed, and cleans again on the next run', async () => {
    const ws = setup('6.0.0')
    installed(ws, 'is-number', '7.0.0')
    chmodSync(path.join(ws, 'node_modules'), 0o555)
    const seen: Array<{ args: string[]; modules: boolean; lock: boolean }> = []
    // The code and path of a refused recursive removal are the runtime's own (Node names the package it could not
    // remove, Bun node_modules itself, and a run once saw ENOTEMPTY for EACCES), so only the path's folder is checked.
    await expect(prepareWorkspace(ws, packageJson, fakeNpm(ws, '6.0.0', seen))).rejects.toThrow(expect.objectContaining({ path: expect.stringContaining(path.join(ws, 'node_modules')) }))
    expect(seen).toEqual([])
    chmodSync(path.join(ws, 'node_modules'), 0o755)
    await prepareWorkspace(ws, packageJson, fakeNpm(ws, '6.0.0', seen))
    expect(seen).toMatchObject([{ modules: false, lock: false }])
  })
})
