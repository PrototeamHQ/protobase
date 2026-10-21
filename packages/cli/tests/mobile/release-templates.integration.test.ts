import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFileId, fileRefId } from '../../src/mobile/privacy-manifest'
import { prepareReleaseProject } from '../../src/mobile/release-project'

// The release edits on the templates of the Capacitor CLI @protobase/mobile pins, so a Capacitor update that moves an
// anchor fails here rather than on a developer's release.
const capacitorCli = path.dirname(createRequire(path.join(import.meta.dirname, '../../../mobile/package.json')).resolve('@capacitor/cli/package.json'))

let ws = ''
beforeAll(() => {
  ws = mkdtempSync(path.join(tmpdir(), 'protobase-release-templates-'))
  for (const [platform, template] of [['android', 'android-template.tar.gz'], ['ios', 'ios-spm-template.tar.gz']]) {
    mkdirSync(path.join(ws, platform as string))
    execFileSync('tar', ['-xzf', path.join(capacitorCli, 'assets', template as string), '-C', path.join(ws, platform as string)])
  }
})
afterAll(() => rmSync(ws, { recursive: true, force: true }))

const version = { version: '1.2.3', build: '7' }
const read = (...parts: string[]) => readFileSync(path.join(ws, ...parts), 'utf8')

describe('the release edits on Capacitor\'s templates', () => {
  it('sign and version the Android release', async () => {
    await prepareReleaseProject(ws, 'android', version)
    const gradle = read('android', 'app', 'build.gradle')
    expect(gradle).toContain('versionCode 7\n')
    expect(gradle).toContain('versionName "1.2.3"\n')
    expect(gradle).toMatch(/release \{\n\s+signingConfig signingConfigs\.release\n/)
  })

  it('version the iOS app and bundle its privacy manifest', async () => {
    const before = read('ios', 'App', 'App.xcodeproj', 'project.pbxproj')
    expect(before).not.toContain(fileRefId)
    expect(before).not.toContain(buildFileId)
    await prepareReleaseProject(ws, 'ios', version)
    const pbxproj = read('ios', 'App', 'App.xcodeproj', 'project.pbxproj')
    expect(pbxproj.match(/CURRENT_PROJECT_VERSION = 7;/g)).toHaveLength(2)
    expect(pbxproj.match(/MARKETING_VERSION = 1\.2\.3;/g)).toHaveLength(2)
    expect(pbxproj.match(new RegExp(fileRefId, 'g'))).toHaveLength(3)
    expect(pbxproj.match(new RegExp(buildFileId, 'g'))).toHaveLength(2)
    expect(read('ios', 'App', 'App', 'PrivacyInfo.xcprivacy')).toContain('CA92.1')
    // The app reads its version from these build settings.
    expect(read('ios', 'App', 'App', 'Info.plist')).toMatch(/<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/)
  })
})
