import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** For tests: the head of Capacitor 8.5.3's AndroidManifest.xml, as `cap add android` writes it. */
export const templateManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">
    </application>
</manifest>
`

/** For tests: the template's AndroidManifest.xml in the workspace `ws`. */
export const writeAndroidTemplate = (ws: string, manifest = templateManifest) => {
  const dir = path.join(ws, 'android', 'app', 'src', 'main')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'AndroidManifest.xml'), manifest)
}
