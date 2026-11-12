import { describe, expect, it } from 'vitest'
import { dataExtractionRules, withoutBackup } from './android-backup'
import { templateManifest } from './android-template-fixture'

const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']

describe('withoutBackup', () => {
  it('turns backup off, points at the rules, and keeps a plugin from turning either back on', () => {
    expect(withoutBackup(templateManifest)).toBe(templateManifest
      .replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">')
      .replace('        android:allowBackup="true"\n', '        android:allowBackup="false"\n        android:dataExtractionRules="@xml/data_extraction_rules"\n        tools:replace="android:allowBackup,android:dataExtractionRules"\n'))
    expect(withoutBackup(templateManifest)).not.toContain('allowBackup="true"')
  })

  it('refuses a manifest that is not the template, rather than leave backup on', () => {
    const line = '        android:allowBackup="true"\n'
    for (const manifest of [
      templateManifest.replace(line, ''),
      templateManifest.replace(line, line + line),
      templateManifest.replace(line, `${line}        android:dataExtractionRules="@xml/mine"\n`),
      templateManifest.replace('<manifest xmlns:android', '<manifest package="x" xmlns:android'),
      withoutBackup(templateManifest),
    ]) expect(() => withoutBackup(manifest)).toThrow('AndroidManifest.xml is not Capacitor\'s template')
  })
})

describe('dataExtractionRules', () => {
  it('excludes every domain from cloud backup and device transfer, and includes nothing', () => {
    for (const section of ['cloud-backup', 'device-transfer']) {
      const body = dataExtractionRules.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))?.[1] ?? ''
      for (const domain of domains) expect(body, `${section} ${domain}`).toContain(`<exclude domain="${domain}" path="."/>`)
    }
    expect(dataExtractionRules).not.toContain('<include')
  })
})
