import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { androidSplashFiles, splashBackgroundResource, templateSplashImages, withAndroidSplash, withLaunchTheme } from './android-splash'
import { templateStyles, writeProtobaseSplash, writeTemplateSplash } from './native-splash-fixture'

const colors = { light: '#f4f3ee', dark: '#0f0f11' }
const res = (ws: string, file: string) => path.join(ws, 'android', 'app', 'src', 'main', 'res', file)

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe('withLaunchTheme', () => {
  it("gives the launch theme the launcher icon on the app's background, in place of the template's splash image", () => {
    const styles = withLaunchTheme(templateStyles)
    expect(styles).toContain('<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen.IconBackground">')
    expect(styles).toContain('<item name="windowSplashScreenBackground">@color/protobase_splash_background</item>')
    expect(styles).toContain('<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>')
    expect(styles).toContain('<item name="windowSplashScreenIconBackgroundColor">@color/ic_launcher_background</item>')
    expect(styles).not.toContain('@drawable/splash')
    expect(styles.replace(/ {4}<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/, '')).toBe(templateStyles.replace(/ {4}<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/, ''))
  })

  it('fails on a styles.xml that is not the template', () => {
    expect(() => withLaunchTheme(templateStyles.replace('@drawable/splash', '@drawable/own_splash'))).toThrow("styles.xml is not Capacitor's template")
  })
})

describe('withAndroidSplash', () => {
  it("replaces the template's splash with Protobase's, on the app's light and dark background", async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-android-splash-'))
    writeProtobaseSplash(ws)
    writeTemplateSplash(ws, 'android')
    await withAndroidSplash(ws, colors)
    expect(readFileSync(res(ws, 'values/styles.xml'), 'utf8')).toBe(withLaunchTheme(templateStyles))
    expect(readFileSync(res(ws, 'values/protobase_splash.xml'), 'utf8')).toBe(splashBackgroundResource('#f4f3ee'))
    expect(readFileSync(res(ws, 'values-night/protobase_splash.xml'), 'utf8')).toBe(splashBackgroundResource('#0f0f11'))
    for (const image of templateSplashImages) expect(existsSync(path.join(ws, 'android', image)), image).toBe(false)
    for (const file of androidSplashFiles) expect(readFileSync(path.join(ws, 'android', file), 'utf8')).toBe('protobase')
  })

  it('fails on a template without one of the splash images', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-android-splash-'))
    writeProtobaseSplash(ws)
    writeTemplateSplash(ws, 'android')
    rmSync(path.join(ws, 'android', templateSplashImages[3]!))
    await expect(withAndroidSplash(ws, colors)).rejects.toThrow(`The generated android project has no ${templateSplashImages[3]}`)
  })
})

describe('splashBackgroundResource', () => {
  it('is the colour resource the launch theme and the splash layout name', () => {
    expect(splashBackgroundResource('#0f0f11')).toContain('<color name="protobase_splash_background">#0f0f11</color>')
  })
})
