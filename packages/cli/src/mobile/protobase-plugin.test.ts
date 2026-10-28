import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkIosPlugins, checkProtobasePlugin, guardLiveUpdate, protobaseIosPluginClasses, protobaseIosProduct, protobasePluginClasses } from './protobase-plugin'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const stock = { pkg: '@capawesome/capacitor-live-update', classpath: 'io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin' }
const guard = { pkg: '@protobase/mobile', classpath: 'net.protobase.mobile.GuardedLiveUpdate' }
const camera = { pkg: '@capacitor/camera', classpath: 'com.capacitorjs.plugins.camera.CameraPlugin' }
const protobase = protobasePluginClasses.map((classpath) => ({ pkg: '@protobase/mobile', classpath }))

const pluginsFile = () => path.join(ws, 'android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json')
const listingEntries = (entries: Array<{ pkg: string; classpath: string }>) => {
  ws = mkdtempSync(path.join(tmpdir(), 'protobase-plugin-'))
  mkdirSync(path.dirname(pluginsFile()), { recursive: true })
  writeFileSync(pluginsFile(), JSON.stringify(entries))
  return ws
}
const listing = (classes: string[]) => listingEntries(classes.map((classpath) => ({ pkg: 'x', classpath })))
const listed = () => JSON.parse(readFileSync(pluginsFile(), 'utf8'))

describe('checkProtobasePlugin', () => {
  it('passes an app that lists every class of the plugin', async () => {
    await expect(checkProtobasePlugin(listing(['com.capacitorjs.plugins.camera.CameraPlugin', ...protobasePluginClasses]))).resolves.toBeUndefined()
  })

  it('refuses an app without the plugin, naming the workspace to delete', async () => {
    const dir = listing(protobasePluginClasses.filter((name) => !name.endsWith('.LocalServerGuard')))
    await expect(checkProtobasePlugin(dir)).rejects.toThrow(`lacks Protobase's native plugin (net.protobase.mobile.LocalServerGuard): delete ${dir}`)
  })

  it('passes the guarded live updater', async () => {
    await expect(checkProtobasePlugin(listingEntries([guard, ...protobase]))).resolves.toBeUndefined()
  })

  it('refuses the stock live updater, naming its class', async () => {
    await expect(checkProtobasePlugin(listingEntries([stock, ...protobase]))).rejects.toThrow(`lists ${stock.classpath}, which hands page script the live updater unguarded`)
  })

  it("refuses any other class of the live updater's package", async () => {
    const other = { pkg: stock.pkg, classpath: 'io.capawesome.capacitorjs.plugins.liveupdate.OtherPlugin' }
    await expect(checkProtobasePlugin(listingEntries([guard, other, ...protobase]))).rejects.toThrow(`lists ${other.classpath}`)
  })
})

describe('guardLiveUpdate', () => {
  it('puts the guard in the stock class\'s place, keeping the other entries and their order', async () => {
    await guardLiveUpdate(listingEntries([camera, stock, ...protobase]))
    expect(listed()).toEqual([camera, guard, ...protobase])
  })

  it('leaves a list without the live updater as it is', async () => {
    await guardLiveUpdate(listingEntries([camera, ...protobase]))
    expect(readFileSync(pluginsFile(), 'utf8')).toBe(JSON.stringify([camera, ...protobase]))
  })

  it("leaves another class of the live updater's package for the check to refuse", async () => {
    const other = { pkg: stock.pkg, classpath: 'io.capawesome.capacitorjs.plugins.liveupdate.OtherPlugin' }
    await guardLiveUpdate(listingEntries([other, ...protobase]))
    expect(listed()).toEqual([other, ...protobase])
  })
})

describe('checkIosPlugins', () => {
  const product = '.product(name: "ProtobaseMobile", package: "ProtobaseMobile")'
  // What `cap add ios` writes: the class list (raw text, or none) and the app's Swift package (or none).
  const iosWorkspace = ({ config, manifest = product }: { config?: string; manifest?: string | null }) => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-plugin-'))
    mkdirSync(path.join(ws, 'ios', 'App', 'App'), { recursive: true })
    mkdirSync(path.join(ws, 'ios', 'App', 'CapApp-SPM'), { recursive: true })
    if (config !== undefined) writeFileSync(path.join(ws, 'ios', 'App', 'App', 'capacitor.config.json'), config)
    if (manifest !== null) writeFileSync(path.join(ws, 'ios', 'App', 'CapApp-SPM', 'Package.swift'), `dependencies: [\n${manifest}\n]`)
    return ws
  }
  const listing = (classes: unknown) => JSON.stringify({ appId: 'com.example.shop', packageClassList: classes })
  const stale = (what: string, at: string) => `The iOS app lacks Protobase's native plugin (${what}): delete ${at} and run the command again`

  it("passes an app with Protobase's plugin classes and product, without the live updater", async () => {
    await expect(checkIosPlugins(iosWorkspace({ config: listing(['AppPlugin', 'SplashScreenPlugin', ...protobaseIosPluginClasses]) }))).resolves.toBeUndefined()
  })

  it('refuses the live updater, naming its class', async () => {
    await expect(checkIosPlugins(iosWorkspace({ config: listing(['AppPlugin', ...protobaseIosPluginClasses, 'LiveUpdatePlugin']) }))).rejects.toThrow('The iOS app lists LiveUpdatePlugin')
  })

  it('refuses an app without ProtobaseAuthPlugin, naming the workspace to delete', async () => {
    const at = iosWorkspace({ config: listing(['AppPlugin', 'ProtobaseBounce']) })
    await expect(checkIosPlugins(at)).rejects.toThrow(stale('ProtobaseAuthPlugin', at))
  })

  it("refuses an app whose Swift package lacks Protobase's product, which leaves the listed classes out at launch", async () => {
    const at = iosWorkspace({ config: listing(protobaseIosPluginClasses), manifest: '.product(name: "AppPlugin", package: "AppPlugin")' })
    await expect(checkIosPlugins(at)).rejects.toThrow(stale(protobaseIosProduct, at))
    const without = iosWorkspace({ config: listing(protobaseIosPluginClasses), manifest: null })
    await expect(checkIosPlugins(without)).rejects.toThrow(stale(protobaseIosProduct, without))
  })

  it('refuses a missing or unparsable class list, or one that is no array, as a stale workspace', async () => {
    for (const config of [undefined, '{"packageClassList": [', listing('ProtobaseBounce ProtobaseAuthPlugin'), listing({ 0: 'ProtobaseAuthPlugin' }), 'null']) {
      const at = iosWorkspace({ ...(config !== undefined && { config }) })
      await expect(checkIosPlugins(at)).rejects.toThrow(stale(protobaseIosPluginClasses.join(', '), at))
      rmSync(at, { recursive: true, force: true })
    }
  })
})

// What `cap add ios` reads from @protobase/mobile: the package and product its name gives (@capacitor/cli plugin.js
// fixName), and the plugin class named by the first `@objc(...)` of each Swift source (util/iosplugin.js).
describe("Protobase's iOS plugin", () => {
  const mobile = path.join(import.meta.dirname, '../../../mobile')
  const sources = path.join(mobile, 'ios/Sources/ProtobaseMobile')

  it('is a Swift package named as Capacitor names @protobase/mobile', () => {
    const manifest = readFileSync(path.join(mobile, 'Package.swift'), 'utf8')
    expect(manifest).toContain(`name: "${protobaseIosProduct}"`)
    expect(manifest).toContain(`.library(name: "${protobaseIosProduct}", targets: ["ProtobaseMobile"])`)
  })

  it('declares exactly the classes the check requires', () => {
    const declared = readdirSync(sources)
      .filter((name) => name.endsWith('.swift'))
      .flatMap((name) => readFileSync(path.join(sources, name), 'utf8').match(/@objc\(([A-Za-z0-9_-]+)\)/)?.[1] ?? [])
    expect(declared.sort()).toEqual([...protobaseIosPluginClasses].sort())
  })
})
