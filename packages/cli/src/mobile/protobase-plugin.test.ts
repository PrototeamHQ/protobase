import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkIosPlugins, checkProtobasePlugin, guardLiveUpdate, protobaseIosPlugin, protobasePluginClasses } from './protobase-plugin'

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
  const iosListing = (classes: string[]) => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-plugin-'))
    mkdirSync(path.join(ws, 'ios', 'App', 'App'), { recursive: true })
    writeFileSync(path.join(ws, 'ios', 'App', 'App', 'capacitor.config.json'), JSON.stringify({ appId: 'com.example.shop', packageClassList: classes }))
    return ws
  }

  it("passes an app with Protobase's plugin and without the live updater", async () => {
    await expect(checkIosPlugins(iosListing(['AppPlugin', 'SplashScreenPlugin', protobaseIosPlugin]))).resolves.toBeUndefined()
  })

  it('refuses the live updater, naming its class', async () => {
    await expect(checkIosPlugins(iosListing(['AppPlugin', protobaseIosPlugin, 'LiveUpdatePlugin']))).rejects.toThrow('The iOS app lists LiveUpdatePlugin')
  })

  it("refuses an app without Protobase's plugin, naming the workspace to delete", async () => {
    const listed = iosListing(['AppPlugin'])
    await expect(checkIosPlugins(listed)).rejects.toThrow(`The iOS app lacks Protobase's native plugin (ProtobaseBounce): delete ${listed} and run the command again`)
  })
})

// What `cap add ios` reads from @protobase/mobile: the package and product its name gives (@capacitor/cli plugin.js
// fixName), and the plugin classes named by `@objc(...)` in its Swift sources (util/iosplugin.js).
describe("Protobase's iOS plugin", () => {
  const mobile = path.join(import.meta.dirname, '../../../mobile')

  it('is a Swift package named as Capacitor names @protobase/mobile', () => {
    const manifest = readFileSync(path.join(mobile, 'Package.swift'), 'utf8')
    expect(manifest).toContain('name: "ProtobaseMobile"')
    expect(manifest).toContain('.library(name: "ProtobaseMobile", targets: ["ProtobaseMobile"])')
  })

  it('declares the class the check requires', () => {
    const source = readFileSync(path.join(mobile, 'ios/Sources/ProtobaseMobile/ProtobaseBounce.swift'), 'utf8')
    expect(source.match(/@objc\(([A-Za-z0-9_-]+)\)/)?.[1]).toBe(protobaseIosPlugin)
  })
})
