// The template's project has no synchronized folders, so PrivacyInfo.xcprivacy is bundled only once project.pbxproj
// lists it: a file reference in the App group and a build file in the Resources phase, next to capacitor.config.json.

/** Where the manifest goes in the generated iOS project, from `ios/`. */
export const privacyManifestPath = ['App', 'App', 'PrivacyInfo.xcprivacy']

/** The app's privacy manifest: the live updater keeps its state in UserDefaults, for the app itself only (CA92.1). */
export const privacyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
</dict>
</plist>
`

// Ids of our own, which the template does not use (the test checks).
export const fileRefId = 'A1B2C3D4E5F6A7B8C9D0E1F2'
export const buildFileId = 'A1B2C3D4E5F6A7B8C9D0E1F3'

const config = '50379B222058CBB4000EE86E /* capacitor.config.json */'
const configInResources = '50379B232058CBB4000EE86E /* capacitor.config.json in Resources */'

// Each anchor, and the line that goes before it.
const insertions = [
  ['/* End PBXBuildFile section */', `\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* PrivacyInfo.xcprivacy */; };\n`],
  ['/* End PBXFileReference section */', `\t\t${fileRefId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`],
  [`\t\t\t\t${config},\n`, `\t\t\t\t${fileRefId} /* PrivacyInfo.xcprivacy */,\n`],
  [`\t\t\t\t${configInResources},\n`, `\t\t\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */,\n`],
] as const

/** The project.pbxproj bundling PrivacyInfo.xcprivacy into the app. */
export const withPrivacyManifest = (pbxproj: string) => {
  if (pbxproj.includes(fileRefId) || pbxproj.includes(buildFileId)) throw new Error('project.pbxproj already has the privacy manifest\'s ids')
  return insertions.reduce((text, [anchor, line]) => {
    const parts = text.split(anchor)
    if (parts.length !== 2) throw new Error(`project.pbxproj has \`${anchor.trim()}\` ${parts.length - 1} times, not once as in Capacitor's template`)
    return parts.join(`${line}${anchor}`)
  }, pbxproj)
}
