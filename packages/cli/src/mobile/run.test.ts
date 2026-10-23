import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    write(path.join(modules, 'native-run/package.json'), JSON.stringify({ name: 'native-run', version: '2.0.3', bin: { 'native-run': 'bin/native-run' } }))
  }
  if (command === 'node' && args[1] === 'add' && args[2] === 'ios') {
    const configuration = '\t\t\t\tCODE_SIGN_STYLE = Automatic;\n'
    write(path.join(options.cwd, 'ios/App/App.xcodeproj/project.pbxproj'), `${configuration}${configuration}`)
  }
}

// native-run's list with one iPhone connected.
const capture = async () => JSON.stringify({ devices: [{ id: '00008110-0001', name: 'iPhone' }], virtualDevices: [{ id: 'SIM-1' }], errors: [] })

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

  it('signs every generated iOS project with --team, and builds once for the connected iPhone allowed to create its profile', async () => {
    const dir = project("{ appId: 'com.example.shop' }")
    const ws = path.join(dir, '.protobase', 'mobile')
    for (const run of [1, 2]) {
      const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
      await mobileRun({ projectDir: dir, platform: 'ios', api: 'https://api.example.com', team: 'ABCDE12345', extensions: [] }, () => {}, { run: fakeRun(calls), capture, build })
      expect(calls.slice(-3).map(({ command, args }) => [command, ...args.slice(command === 'node' ? 1 : 0)]), `run ${run}`).toEqual([
        ['node', 'add', 'ios'],
        ['xcrun', 'xcodebuild', '-project', 'App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-destination', 'id=00008110-0001', '-derivedDataPath', path.join(ws, 'ios', 'DerivedData', '00008110-0001'), '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration'],
        ['node', 'run', 'ios', '--no-sync', '--target', '00008110-0001'],
      ])
      expect(readFileSync(path.join(ws, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8').match(/DEVELOPMENT_TEAM = ABCDE12345;/g)).toHaveLength(2)
    }
  })

  it('refuses --team on Android before anything is installed, as `mobile build` does', async () => {
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const dir = project("{ appId: 'com.example.shop' }")
    await expect(mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', team: 'ABCDE12345', extensions: [] }, () => {}, { run: fakeRun(calls), build })).rejects.toThrow('--team is for iOS')
    expect(calls).toEqual([])
  })

  it('says what to add without a mobile section', async () => {
    const dir = project('undefined')
    await expect(mobileOpen({ projectDir: dir, platform: 'ios', extensions: [], api: 'https://api.example.com' }, () => {}, { run: fakeRun([]), build })).rejects.toThrow('This project has no mobile section')
  })
})
