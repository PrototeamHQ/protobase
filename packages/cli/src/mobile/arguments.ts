import { InvalidArgumentError } from 'commander'
import { platforms, type Platform } from './platform'

/** The `<platform>` argument: ios or android. */
export const parsePlatform = (value: string): Platform => {
  if ((platforms as readonly string[]).includes(value)) return value as Platform
  throw new InvalidArgumentError('expected ios or android')
}

/** A `--port` option: digits only, from 1 to 65535, as a number, so no other text reaches a URL or Capacitor. */
export const parsePort = (value: string) => {
  const number = /^\d{1,5}$/.test(value) ? Number(value) : 0
  if (number < 1 || number > 65535) throw new InvalidArgumentError('expected a port from 1 to 65535')
  return number
}

// The values below are the only text a release build writes into build.gradle, project.pbxproj and Capacitor's
// export plist, so each is checked whole, in ASCII, with nothing before or after it.

/** `--app-version`: one to three dot-separated numbers, the version both stores show, such as 1.2.3. */
export const parseAppVersion = (value: string) => {
  if (/^\d{1,9}(?:\.\d{1,9}){0,2}$/.test(value)) return value
  throw new InvalidArgumentError('expected one to three numbers separated by dots, such as 1.2.3')
}

// The highest versionCode Google Play takes.
const maxBuildNumber = 2_100_000_000

/** `--build-number`: a whole number from 1 to 2100000000, which rises with each upload. */
export const parseBuildNumber = (value: string) => {
  if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= maxBuildNumber) return value
  throw new InvalidArgumentError(`expected a whole number from 1 to ${maxBuildNumber}`)
}

/** `--team`: an Apple Developer team id, ten capital letters and digits. */
export const parseTeamId = (value: string) => {
  if (/^[A-Z0-9]{10}$/.test(value)) return value
  throw new InvalidArgumentError('expected an Apple Developer team id, ten capital letters and digits such as ABCDE12345')
}

/**
 * `--certificate` and `--profile`: a signing certificate or provisioning profile name. Capacitor writes it into its
 * export plist unescaped, so no XML markup or control character, and no leading dash xcodebuild could take for a flag.
 */
export const parseSigningName = (value: string) => {
  if (/^[^-<>&\p{Cc}][^<>&\p{Cc}]*$/u.test(value)) return value
  throw new InvalidArgumentError('expected a certificate or profile name without <, >, &, control characters or a leading -')
}
