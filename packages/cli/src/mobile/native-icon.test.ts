import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { nativeIconFiles, templateIconFiles, withAppIcon, withProtobaseIcon } from './native-icon'
import { writeProtobaseIcon, writeTemplateIcon } from './native-icon-fixture'
import { platforms } from './platform'

const mobilePackage = fileURLToPath(new URL('../../../mobile', import.meta.url))
const shipped = (platform: string, file: string) => readFileSync(path.join(mobilePackage, 'icon', platform, file))
const shippedFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? shippedFiles(path.join(dir, entry.name)).map((file) => path.join(entry.name, file)) : [entry.name]))

// The files the pinned Capacitor's `cap add` writes, from its templates.
const templates = { ios: 'ios-spm-template.tar.gz', android: 'android-template.tar.gz' }
const templateFiles = (platform: keyof typeof templates) =>
  execFileSync('tar', ['-tzf', path.join(mobilePackage, 'node_modules', '@capacitor', 'cli', 'assets', templates[platform])], { encoding: 'utf8' })
    .split('\n')
    .map((file) => file.replace(/^\.\//, ''))

const densityScale = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe("Protobase's icon in @protobase/mobile", () => {
  it.each(platforms)('has exactly the %s icon files the template has', (platform) => {
    expect(shippedFiles(path.join(mobilePackage, 'icon', platform)).sort()).toEqual([...nativeIconFiles[platform]].sort())
    expect(templateFiles(platform)).toEqual(expect.arrayContaining(templateIconFiles[platform]))
  })

  it('gives iOS one opaque 1024 pixel icon, as the App Store takes no alpha channel', () => {
    const png = shipped('ios', nativeIconFiles.ios[0]!)
    expect(pngSize(png)).toEqual({ width: 1024, height: 1024 })
    expect(png[25]).toBe(2)
  })

  it('gives Android each icon at its density', () => {
    for (const file of nativeIconFiles.android.filter((name) => name.endsWith('.png'))) {
      const scale = densityScale[file.match(/mipmap-(\w+)\//)![1] as keyof typeof densityScale]
      const size = (file.endsWith('_foreground.png') ? 108 : 48) * scale
      expect(pngSize(shipped('android', file)), file).toEqual({ width: size, height: size })
    }
  })
})

describe('withProtobaseIcon', () => {
  it.each(platforms)("replaces the %s template's icon with Protobase's", async (platform) => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-icon-'))
    writeProtobaseIcon(ws)
    writeTemplateIcon(ws, platform)
    await withProtobaseIcon(ws, platform)
    for (const file of nativeIconFiles[platform]) expect(readFileSync(path.join(ws, platform, file), 'utf8')).toBe('protobase')
  })

  it('fails on a template without one of the icon files', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-icon-'))
    writeProtobaseIcon(ws)
    writeTemplateIcon(ws, 'android')
    rmSync(path.join(ws, 'android', nativeIconFiles.android[0]!))
    await expect(withProtobaseIcon(ws, 'android')).rejects.toThrow(`The generated android project has no ${nativeIconFiles.android[0]}`)
  })

  it('fails on an @protobase/mobile without the icon', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-icon-'))
    writeTemplateIcon(ws, 'ios')
    await expect(withProtobaseIcon(ws, 'ios')).rejects.toThrow("@protobase/mobile has no ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png of Protobase's icon")
  })
})

describe('withAppIcon', () => {
  it("writes the app's icon over the template's, and beside it", async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-icon-'))
    writeTemplateIcon(ws, 'android')
    const files = [...templateIconFiles.android, 'app/src/main/res/mipmap-mdpi/ic_launcher_monochrome.png'].map((file) => ({ file, content: 'app' }))
    await withAppIcon(ws, 'android', files)
    for (const { file } of files) expect(readFileSync(path.join(ws, 'android', file), 'utf8')).toBe('app')
  })

  it('fails on a template without one of the files it replaces', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-icon-'))
    writeTemplateIcon(ws, 'ios')
    rmSync(path.join(ws, 'ios', templateIconFiles.ios[1]!))
    await expect(withAppIcon(ws, 'ios', templateIconFiles.ios.map((file) => ({ file, content: 'app' })))).rejects.toThrow(`The generated ios project has no ${templateIconFiles.ios[1]}, which the app's icon replaces`)
  })
})
