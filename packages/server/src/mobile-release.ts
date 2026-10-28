// `@protobase/server/mobile-release`: what composes and serves the mobile release of an app's files, apart from the main
// entry so a host that serves bundles without running their config, such as a router or a static host, imports it
// without loading the server. `protobase serve` composes its release with the same exports.
export { composeRelease, releaseManifest, type MobileRelease, type ReleaseFile, type ReleaseSigning, type ServedReleaseFile } from './mobile-release/release'
export { mobileReleaseApp, type MobileReleaseAppInput, type OfferedRelease } from './mobile-release/release-app'
export { mobileSigningKeyVariable, readSigningKey } from './mobile-release/signing-key'
export { nativeFingerprint } from './mobile-release/fingerprint'
export { withApiOrigin } from './mobile-release/api-origin-page'
