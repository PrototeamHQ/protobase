import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { androidSplashFiles, templateSplashImages } from './android-splash'
import { iosSplashFiles } from './ios-splash'
import { protobaseSplashDir } from './native-splash'
import type { Platform } from './platform'

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// A file, or for the image set a folder with its Contents.json, holding `content`.
const writeSplash = (at: string, content: string) => write(at.endsWith('.imageset') ? path.join(at, 'Contents.json') : at, content)

/** For tests: Capacitor 8.5.3's android styles.xml, as `cap add android` writes it. */
export const templateStyles = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <!-- Customize your theme here. -->
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>


    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>`

/** For tests: the splash files of an installed @protobase/mobile in the workspace `ws`, each holding `protobase`. */
export const writeProtobaseSplash = (ws: string) => {
  for (const file of iosSplashFiles) writeSplash(path.join(protobaseSplashDir(ws, 'ios'), file), 'protobase')
  for (const file of androidSplashFiles) writeSplash(path.join(protobaseSplashDir(ws, 'android'), file), 'protobase')
}

/** For tests: the splash files `cap add` writes in the platform's native project, each image holding `capacitor`. */
export const writeTemplateSplash = (ws: string, platform: Platform, styles = templateStyles) => {
  if (platform === 'ios') {
    for (const file of iosSplashFiles) writeSplash(path.join(ws, 'ios', file), 'capacitor')
    write(path.join(ws, 'ios', iosSplashFiles[1]!, 'splash-2732x2732.png'), 'capacitor')
    return
  }
  write(path.join(ws, 'android', 'app/src/main/res/values/styles.xml'), styles)
  for (const image of templateSplashImages) write(path.join(ws, 'android', image), 'capacitor')
}
