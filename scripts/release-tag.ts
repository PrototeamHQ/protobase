import semver from 'semver'

// The x.y.z version a release tag vx.y.z names, or undefined when `tag` is no release tag: no leading v, no semver
// version, or a prerelease.
export const releaseVersion = (tag: string) => {
  const version = tag.startsWith('v') ? tag.slice(1) : ''
  return semver.valid(version) === version && semver.prerelease(version) === null ? version : undefined
}
