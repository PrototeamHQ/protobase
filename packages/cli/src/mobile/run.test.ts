import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChildOptions } from './child-process'
import { mobileOpen, mobileRun } from './run'

let root = ''
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  for (const key of ['PARENT_SECRET', 'CONFIG_SECRET', 'OWN_SECRET']) delete process.env[key]
})

// A project in a folder of its own, under a parent whose .env Node's lookup finds, with a config that writes a secret
// into the environment when it loads.
const project = (mobile: string, envFile?: string) => {
  root = mkdtempSync(path.join(tmpdir(), 'protobase-mobile-run-'))
  const dir = path.join(root, 'shop')
  mkdirSync(dir)
  writeFileSync(path.join(root, '.env'), 'PARENT_SECRET=parent\n')
  writeFileSync(path.join(dir, 'protobase.config.ts'), `process.env.CONFIG_SECRET = 'config'\nexport default { mobile: ${mobile} }\n`)
  if (envFile) writeFileSync(path.join(dir, '.env.local'), envFile)
  return dir
}

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// npm and Capacitor as they leave the workspace, recording every call.
const fakeRun = (calls: Array<{ command: string; args: string[] } & ChildOptions>) => async (command: string, args: string[], options: ChildOptions) => {
  calls.push({ command, args, ...options })
  const modules = path.join(options.cwd, 'node_modules')
  if (command === 'npm') {
    write(path.join(modules, '@protobase/mobile/package.json'), JSON.stringify({ name: '@protobase/mobile', version: '0.14.2' }))
    write(path.join(modules, '@capacitor/cli/package.json'), JSON.stringify({ name: '@capacitor/cli', version: '8.5.3', bin: { cap: './bin/capacitor' } }))
  }
}

const build = async ({ outDir }: { outDir: string }) => write(path.join(outDir, 'public', 'index.html'), '<head></head>')

describe('mobileRun', () => {
  it('hands npm and Capacitor no variable the project\'s env files, its parent\'s .env or its config set, and always CI', async () => {
    const dir = project("{ appId: 'com.example.shop' }", 'OWN_SECRET=own\n')
    process.env.OWN_SECRET = 'own'
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const out: string[] = []
    await mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', extensions: [] }, (text) => void out.push(text), { run: fakeRun(calls), build })
    expect(process.env.PARENT_SECRET).toBe('parent')
    expect(process.env.CONFIG_SECRET).toBe('config')
    expect(calls.map(({ command, args }) => [command, ...args.slice(command === 'node' ? 1 : 0)])).toEqual([
      ['npm', 'install', '--install-links', '--no-audit', '--no-fund'],
      ['node', 'add', 'android'],
      ['node', 'run', 'android', '--no-sync', '--forwardPorts', '3000:3000'],
    ])
    for (const { env } of calls) {
      expect(env.CI).toBe('true')
      for (const key of ['PARENT_SECRET', 'CONFIG_SECRET', 'OWN_SECRET']) expect(env).not.toHaveProperty(key)
    }
    expect(out.join('')).toMatch(/^workspace \.protobase\/mobile, api http:\/\/localhost:3000, native fingerprint [0-9a-f]{16}\n$/)
  })

  it('refuses a bad API or a pinned plugin before anything is installed', async () => {
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const deps = { run: fakeRun(calls), build }
    const dir = project("{ appId: 'com.example.shop' }")
    await expect(mobileRun({ projectDir: dir, platform: 'android', api: 'http://192.168.1.10:3000', extensions: [] }, () => {}, deps)).rejects.toThrow('plain http is only for a server on this machine')
    await expect(mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', live: 5173, extensions: [] }, () => {}, deps)).rejects.toThrow('leave out --api')
    rmSync(root, { recursive: true, force: true })
    const pinned = project("{ appId: 'com.example.shop', plugins: { '@capawesome/capacitor-live-update': '8.7.1' } }")
    await expect(mobileRun({ projectDir: pinned, platform: 'ios', extensions: [], api: 'https://api.example.com' }, () => {}, deps)).rejects.toThrow("live updates come with Protobase's updater")
    expect(calls).toEqual([])
  })

  it('says what to add without a mobile section', async () => {
    const dir = project('undefined')
    await expect(mobileOpen({ projectDir: dir, platform: 'ios', extensions: [], api: 'https://api.example.com' }, () => {}, { run: fakeRun([]), build })).rejects.toThrow('This project has no mobile section')
  })
})
