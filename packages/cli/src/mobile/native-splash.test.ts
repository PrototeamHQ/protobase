import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { androidSplashFiles, templateSplashImages } from './android-splash'
import { iosSplashFiles } from './ios-splash'
import { templateStyles } from './native-splash-fixture'

const mobilePackage = fileURLToPath(new URL('../../../mobile', import.meta.url))
const splashDir = path.join(mobilePackage, 'splash')
const shippedFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? shippedFiles(path.join(dir, entry.name)).map((file) => path.join(entry.name, file)) : [entry.name]))

// The pinned Capacitor's templates, which `cap add` writes.
const templates = { ios: 'ios-spm-template.tar.gz', android: 'android-template.tar.gz' }
const template = (platform: keyof typeof templates) => path.join(mobilePackage, 'node_modules', '@capacitor', 'cli', 'assets', templates[platform])
const templateFiles = (platform: keyof typeof templates) =>
  execFileSync('tar', ['-tzf', template(platform)], { encoding: 'utf8' }).split('\n').map((file) => file.replace(/^\.\//, ''))

const imageSet = iosSplashFiles[1]!

describe("Protobase's splash screen in @protobase/mobile", () => {
  it('has exactly the splash files the CLI copies', () => {
    const images = ['splash.png', 'splash@2x.png', 'splash@3x.png', 'Contents.json'].map((file) => path.join(imageSet, file))
    expect(shippedFiles(path.join(splashDir, 'ios')).sort()).toEqual([iosSplashFiles[0]!, ...images].sort())
    expect(shippedFiles(path.join(splashDir, 'android')).sort()).toEqual([...androidSplashFiles].sort())
  })

  it('gives iOS the icon at 128 points, with corners rounded to transparent', () => {
    for (const [file, scale] of [['splash.png', 1], ['splash@2x.png', 2], ['splash@3x.png', 3]] as const) {
      const png = readFileSync(path.join(splashDir, 'ios', imageSet, file))
      expect(pngSize(png), file).toEqual({ width: 128 * scale, height: 128 * scale })
      expect(png[25], file).toBe(6)
    }
  })

  it('names the image set\'s files and the launch screen\'s image and colour', () => {
    const contents = JSON.parse(readFileSync(path.join(splashDir, 'ios', imageSet, 'Contents.json'), 'utf8')) as { images: Array<{ filename: string }> }
    expect(contents.images.map((image) => image.filename)).toEqual(['splash.png', 'splash@2x.png', 'splash@3x.png'])
    const storyboard = readFileSync(path.join(splashDir, 'ios', iosSplashFiles[0]!), 'utf8')
    expect(storyboard).toContain('image="Splash"')
    expect(storyboard).toContain('<color key="backgroundColor" name="SplashBackground"/>')
  })
})

describe("Capacitor's template", () => {
  it('has the iOS launch screen files Protobase replaces', () => {
    expect(templateFiles('ios')).toEqual(expect.arrayContaining([iosSplashFiles[0]!, path.join(imageSet, 'Contents.json')]))
  })

  it('has the Android splash images Protobase removes, and the styles.xml it edits', () => {
    expect(templateFiles('android')).toEqual(expect.arrayContaining(templateSplashImages))
    expect(execFileSync('tar', ['-xzOf', template('android'), 'app/src/main/res/values/styles.xml'], { encoding: 'utf8' })).toBe(templateStyles)
  })
})
