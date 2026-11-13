import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { androidSplashImageName } from './android-splash-image'
import type { NativeFile } from './native-file'
import { copySplashFile, removeTemplateSplash, writeSplashFiles } from './native-splash'
import type { SplashColors } from './splash-colors'

const res = 'app/src/main/res'

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

/** The template's full-screen splash images, with Capacitor's logo, which nothing shows once its launch theme is Protobase's. */
export const templateSplashImages = [
  `${res}/drawable/splash.png`,
  ...['port', 'land'].flatMap((orientation) => densities.map((density) => `${res}/drawable-${orientation}-${density}/splash.png`)),
]

/**
 * Protobase's splash for the splash screen plugin to show while the app reloads into a live update (its `layoutName`):
 * the one the launch shows, drawn as the core-splashscreen library draws it.
 */
export const androidSplashFiles = [`${res}/drawable/protobase_splash.xml`, `${res}/layout/protobase_splash.xml`]

/** The splash screen plugin's `layoutName`, the layout in `androidSplashFiles`. */
export const androidSplashLayout = 'protobase_splash'

const stylesPath = `${res}/values/styles.xml`

const templateLaunchTheme = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>`

// Android 12's splash screen, through the core-splashscreen library on older versions: the launcher icon on its own
// background, in a circle, on the app's background.
const launchTheme = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen.IconBackground">
        <item name="windowSplashScreenBackground">@color/protobase_splash_background</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="windowSplashScreenIconBackgroundColor">@color/ic_launcher_background</item>
    </style>`

// The same with the app's own splash image in place of the launcher icon, with no background of its own.
const imageLaunchTheme = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/protobase_splash_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/${androidSplashImageName}</item>
    </style>`

/**
 * The template's styles.xml with Protobase's launch theme, showing the app's own splash image with `ownImage`; it fails
 * on any other, which may set its own splash.
 */
export const withLaunchTheme = (styles: string, ownImage = false) => {
  if (!styles.includes(templateLaunchTheme)) throw new Error("The generated android project's styles.xml is not Capacitor's template: its launch theme is not the one Protobase replaces")
  return styles.replace(templateLaunchTheme, ownImage ? imageLaunchTheme : launchTheme)
}

/** The `protobase_splash_background` colour resource, in values for light mode and values-night for dark. */
export const splashBackgroundResource = (color: string) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="protobase_splash_background">${color}</color>
</resources>
`

/**
 * Gives the Android project in the workspace Protobase's splash screen on its background, `colors`, in place of
 * Capacitor's: the launcher icon, or the app's own splash image, its `image` files, with them.
 */
export const withAndroidSplash = async (ws: string, { light, dark }: SplashColors, image?: NativeFile[]) => {
  const styles = path.join(ws, 'android', stylesPath)
  await writeFile(styles, withLaunchTheme(await readFile(styles, 'utf8'), image !== undefined))
  for (const [values, color] of [['values', light], ['values-night', dark]] as const) {
    const dir = path.join(ws, 'android', res, values)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'protobase_splash.xml'), splashBackgroundResource(color))
  }
  for (const image of templateSplashImages) await removeTemplateSplash(ws, 'android', image)
  for (const file of androidSplashFiles) await copySplashFile(ws, 'android', file)
  if (image) await writeSplashFiles(ws, 'android', image)
}
