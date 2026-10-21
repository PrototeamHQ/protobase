// Capacitor's templates carry version 1.0, build 1. A release replaces them with the checked `--app-version` and
// `--build-number` (see arguments.ts), each anchor required as often as the template has it.

export type AppVersion = { version: string; build: string }

const replaceExactly = (text: string, file: string, anchor: string, count: number, replacement: string) => {
  const parts = text.split(anchor)
  if (parts.length - 1 !== count) throw new Error(`${file} has \`${anchor.trim()}\` ${parts.length - 1} times, not ${count} as in Capacitor's template`)
  return parts.join(replacement)
}

/** The app's build.gradle with the version as versionName and the build number as versionCode. */
export const withAndroidVersion = (gradle: string, { version, build }: AppVersion) =>
  replaceExactly(
    replaceExactly(gradle, 'app/build.gradle', '        versionCode 1\n', 1, `        versionCode ${build}\n`),
    'app/build.gradle',
    '        versionName "1.0"\n',
    1,
    `        versionName "${version}"\n`,
  )

/** The project.pbxproj with the version and build number in the app target's Debug and Release configurations. */
export const withIosVersion = (pbxproj: string, { version, build }: AppVersion) =>
  replaceExactly(
    replaceExactly(pbxproj, 'project.pbxproj', 'CURRENT_PROJECT_VERSION = 1;', 2, `CURRENT_PROJECT_VERSION = ${build};`),
    'project.pbxproj',
    'MARKETING_VERSION = 1.0;',
    2,
    `MARKETING_VERSION = ${version};`,
  )
