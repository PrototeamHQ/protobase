import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChildOptions } from './child-process'
import { writeProtobaseIcon, writeTemplateIcon } from './native-icon-fixture'
import { nativeDependencies } from './pinned-packages'
import { protobaseIosPluginClasses, protobasePluginClasses } from './protobase-plugin'
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

const protobasePlugins = protobasePluginClasses.map((classpath) => ({ pkg: '@protobase/mobile', classpath }))
const stockLiveUpdate = { pkg: '@capawesome/capacitor-live-update', classpath: 'io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin' }

// npm and Capacitor as they leave the workspace, Protobase's plugin compiled into Android, recording every call; `cap
// add` lists the plugins given, by default Protobase's on Android, and Capacitor's App and Protobase's on iOS, and
// compiles the live updater into the iOS app when it lists its class.
const fakeRun =
  (calls: Array<{ command: string; args: string[] } & ChildOptions>, { android = protobasePlugins, ios = ['AppPlugin', ...protobaseIosPluginClasses] } = {}) =>
  async (command: string, args: string[], options: ChildOptions) => {
    calls.push({ command, args, ...options })
    const modules = path.join(options.cwd, 'node_modules')
    if (command === 'npm') {
      write(path.join(modules, '@protobase/mobile/package.json'), JSON.stringify({ name: '@protobase/mobile', version: '0.14.2' }))
      for (const [name, version] of Object.entries(nativeDependencies)) write(path.join(modules, name, 'package.json'), JSON.stringify({ name, version }))
      write(path.join(modules, '@capacitor/cli/package.json'), JSON.stringify({ name: '@capacitor/cli', version: nativeDependencies['@capacitor/cli'], bin: { cap: './bin/capacitor' } }))
      write(path.join(modules, 'native-run/package.json'), JSON.stringify({ name: 'native-run', version: '2.0.3', bin: { 'native-run': 'bin/native-run' } }))
      writeProtobaseIcon(options.cwd)
    }
    if (command === 'node' && args[1] === 'add') writeTemplateIcon(options.cwd, args[2] === 'ios' ? 'ios' : 'android')
    if (command === 'node' && args[1] === 'add' && args[2] === 'android') {
      write(path.join(options.cwd, 'android/app/src/main/assets/capacitor.plugins.json'), JSON.stringify(android))
    }
    if (command === 'node' && args[1] === 'add' && args[2] === 'ios') {
      const configuration = '\t\t\t\tCODE_SIGN_STYLE = Automatic;\n'
      write(path.join(options.cwd, 'ios/App/App.xcodeproj/project.pbxproj'), `${configuration}${configuration}`)
      write(path.join(options.cwd, 'ios/App/App/capacitor.config.json'), JSON.stringify({ packageClassList: ios }))
      const liveUpdate = ios.includes('LiveUpdatePlugin') ? '\n.product(name: "CapawesomeCapacitorLiveUpdate", package: "CapawesomeCapacitorLiveUpdate")' : ''
      write(path.join(options.cwd, 'ios/App/CapApp-SPM/Package.swift'), `.product(name: "ProtobaseMobile", package: "ProtobaseMobile")${liveUpdate}`)
    }
  }

// native-run's list with one iPhone connected.
const capture = async () => JSON.stringify({ devices: [{ id: '00008110-0001', name: 'iPhone' }], virtualDevices: [{ id: 'SIM-1' }], errors: [] })

const build = async ({ outDir }: { outDir: string }) => write(path.join(outDir, 'public', 'index.html'), '<head></head>')

// The server's web manifest, naming the app.
const fetch = async () => Response.json({ name: 'mobile-lab' }, { headers: { 'content-type': 'application/manifest+json' } })

describe('mobileRun', () => {
  it('hands npm and Capacitor no variable the project\'s env files, its parent\'s .env or its config set, and always CI', async () => {
    const dir = project("{ appId: 'com.example.shop' }", 'OWN_SECRET=own\n')
    process.env.OWN_SECRET = 'own'
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const out: string[] = []
    await mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', extensions: [] }, (text) => void out.push(text), { run: fakeRun(calls), build, fetch })
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
    const deps = { run: fakeRun(calls), build, fetch }
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
      await mobileRun({ projectDir: dir, platform: 'ios', api: 'https://api.example.com', team: 'ABCDE12345', extensions: [] }, () => {}, { run: fakeRun(calls), capture, build, fetch })
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
    await expect(mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', team: 'ABCDE12345', extensions: [] }, () => {}, { run: fakeRun(calls), build, fetch })).rejects.toThrow('--team is for iOS')
    expect(calls).toEqual([])
  })

  it("lists Protobase's guard in the stock live updater's place on Android", async () => {
    const dir = project("{ appId: 'com.example.shop' }")
    await mobileRun({ projectDir: dir, platform: 'android', api: 'http://localhost:3000', extensions: [] }, () => {}, { run: fakeRun([], { android: [stockLiveUpdate, ...protobasePlugins] }), build, fetch })
    const listed = JSON.parse(readFileSync(path.join(dir, '.protobase/mobile/android/app/src/main/assets/capacitor.plugins.json'), 'utf8'))
    expect(listed).toEqual([{ pkg: '@protobase/mobile', classpath: 'net.protobase.mobile.GuardedLiveUpdate' }, ...protobasePlugins])
  })

  it("lists Protobase's guard alone for the live updater on iOS, and runs the app", async () => {
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const dir = project("{ appId: 'com.example.shop' }")
    const deps = { run: fakeRun(calls, { ios: ['AppPlugin', ...protobaseIosPluginClasses, 'GuardedLiveUpdatePlugin', 'LiveUpdatePlugin'] }), build, fetch }
    await mobileRun({ projectDir: dir, platform: 'ios', api: 'https://api.example.com', extensions: [] }, () => {}, deps)
    const listed = JSON.parse(readFileSync(path.join(dir, '.protobase/mobile/ios/App/App/capacitor.config.json'), 'utf8'))
    expect(listed.packageClassList).toEqual(['AppPlugin', ...protobaseIosPluginClasses, 'GuardedLiveUpdatePlugin'])
    expect(calls.map(({ args }) => args[1])).toContain('run')
  })

  it("drops Protobase's guard from an iOS app without the live updater", async () => {
    const dir = project("{ appId: 'com.example.shop' }")
    await mobileRun({ projectDir: dir, platform: 'ios', api: 'https://api.example.com', extensions: [] }, () => {}, { run: fakeRun([], { ios: ['AppPlugin', ...protobaseIosPluginClasses, 'GuardedLiveUpdatePlugin'] }), build, fetch })
    const listed = JSON.parse(readFileSync(path.join(dir, '.protobase/mobile/ios/App/App/capacitor.config.json'), 'utf8'))
    expect(listed.packageClassList).toEqual(['AppPlugin', ...protobaseIosPluginClasses])
  })

  it("refuses a stale iOS workspace without Protobase's plugin class before it runs the app", async () => {
    const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
    const dir = project("{ appId: 'com.example.shop' }")
    const deps = { run: fakeRun(calls, { ios: ['AppPlugin', 'ProtobaseBounce'] }), build, fetch }
    await expect(mobileRun({ projectDir: dir, platform: 'ios', api: 'https://api.example.com', extensions: [] }, () => {}, deps)).rejects.toThrow(
      "The iOS app lacks Protobase's native plugin (ProtobaseAuthPlugin)",
    )
    expect(calls.map(({ args }) => args[1])).not.toContain('run')
  })

  it('refuses a plugin name that leaves node_modules before anything is removed or installed', async () => {
    for (const spec of ['file:../x', '../x']) {
      const calls: Array<{ command: string; args: string[] } & ChildOptions> = []
      const dir = project(`{ appId: 'com.example.shop', plugins: { '../../..': '${spec}' } }`)
      writeFileSync(path.join(dir, 'keep'), '')
      const input = { projectDir: dir, platform: 'android' as const, api: 'http://localhost:3000', extensions: [] }
      await expect(mobileRun(input, () => {}, { run: fakeRun(calls), build, fetch }), spec).rejects.toThrow('mobile.plugins lists "../../..", which is not an npm package name')
      await expect(mobileOpen(input, () => {}, { run: fakeRun(calls), build, fetch }), spec).rejects.toThrow('which is not an npm package name')
      expect(existsSync(path.join(dir, 'keep'))).toBe(true)
      expect(calls).toEqual([])
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('says what to add without a mobile section', async () => {
    const dir = project('undefined')
    await expect(mobileOpen({ projectDir: dir, platform: 'ios', extensions: [], api: 'https://api.example.com' }, () => {}, { run: fakeRun([]), build, fetch })).rejects.toThrow('This project has no mobile section')
  })
})
