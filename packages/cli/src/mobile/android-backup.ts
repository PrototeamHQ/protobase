// The template's root tag and its one backup line, which `withoutBackup` edits.
const rootTag = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
const backupLine = '        android:allowBackup="true"\n'

/** Where the data extraction rules go, relative to the `android` folder. */
export const dataExtractionRulesPath = ['app', 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml']

const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']
const excludeAll = domains.map((domain) => `        <exclude domain="${domain}" path="."/>\n`).join('')

/**
 * The data extraction rules: on Android 12 and later, nothing goes into a cloud backup or a device-to-device transfer,
 * so a signed-in session never moves to another phone. Every domain is named, as `root` is not documented to cover the others.
 */
export const dataExtractionRules = `<?xml version="1.0" encoding="utf-8"?>
<!-- Nothing of the app's carries over to another phone: it starts there as a fresh install. -->
<data-extraction-rules>
    <cloud-backup>
${excludeAll}    </cloud-backup>
    <device-transfer>
${excludeAll}    </device-transfer>
</data-extraction-rules>
`

/**
 * Capacitor's AndroidManifest.xml opting out of backup and device transfer: `allowBackup="false"` for Android 11 and
 * earlier and cloud backup, the data extraction rules for Android 12 and later, and `tools:replace` so a plugin's
 * manifest cannot turn either back on in the merge. Throws on any other manifest rather than leave backup on.
 */
export const withoutBackup = (manifest: string) => {
  if (manifest.split(rootTag).length !== 2 || manifest.split(backupLine).length !== 2 || /dataExtractionRules|fullBackupContent|xmlns:tools/.test(manifest)) {
    throw new Error('AndroidManifest.xml is not Capacitor\'s template: it needs its one root tag and android:allowBackup="true" line, and no backup rules')
  }
  return manifest
    .replace(rootTag, `${rootTag.slice(0, -1)} xmlns:tools="http://schemas.android.com/tools">`)
    .replace(backupLine, '        android:allowBackup="false"\n        android:dataExtractionRules="@xml/data_extraction_rules"\n        tools:replace="android:allowBackup,android:dataExtractionRules"\n')
}
