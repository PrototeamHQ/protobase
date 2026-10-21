import { describe, expect, it } from 'vitest'
import { buildFileId, fileRefId, privacyManifest, withPrivacyManifest } from './privacy-manifest'

// An excerpt of Capacitor's iOS template, project.pbxproj, with each anchor once.
const pbxproj = `/* Begin PBXBuildFile section */
		50379B232058CBB4000EE86E /* capacitor.config.json in Resources */ = {isa = PBXBuildFile; fileRef = 50379B222058CBB4000EE86E /* capacitor.config.json */; };
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
		50379B222058CBB4000EE86E /* capacitor.config.json */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.json; path = capacitor.config.json; sourceTree = "<group>"; };
/* End PBXFileReference section */
			children = (
				50379B222058CBB4000EE86E /* capacitor.config.json */,
			);
			files = (
				50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,
			);
`

describe('privacyManifest', () => {
  it('declares UserDefaults for the app itself (CA92.1), and no tracking', () => {
    expect(privacyManifest).toMatch(/<string>NSPrivacyAccessedAPICategoryUserDefaults<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>CA92\.1<\/string>/)
    expect(privacyManifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/)
  })
})

describe('withPrivacyManifest', () => {
  it('lists the manifest in the App group and the Resources phase', () => {
    const edited = withPrivacyManifest(pbxproj)
    expect(edited).toContain(`\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* PrivacyInfo.xcprivacy */; };\n/* End PBXBuildFile section */`)
    expect(edited).toContain(`\t\t${fileRefId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n/* End PBXFileReference section */`)
    expect(edited).toContain(`\t\t\t\t${fileRefId} /* PrivacyInfo.xcprivacy */,\n\t\t\t\t50379B222058CBB4000EE86E /* capacitor.config.json */,\n`)
    expect(edited).toContain(`\t\t\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */,\n\t\t\t\t50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,\n`)
  })

  it('refuses a project whose anchors are not there once each, or that has the manifest already', () => {
    expect(() => withPrivacyManifest(withPrivacyManifest(pbxproj))).toThrow('already has')
    expect(() => withPrivacyManifest(pbxproj.replace('/* End PBXFileReference section */\n', ''))).toThrow('`/* End PBXFileReference section */` 0 times')
  })
})
