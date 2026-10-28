/** The query parameters of the mobile release answer. Only `mobileReleaseQuery` writes them. */
export const mobileReleaseParams = {
  /** The native fingerprint of the binary asking (`ProtobaseNative/<fingerprint>` in its user agent). */
  fingerprint: 'fingerprint',
  /** The Protobase version of the shell the device runs, which says whether the update is required. */
  shellVersion: 'shell_version',
} as const

/** Where a device asks which release it should run: `GET` with the `mobileReleaseParams`. */
export const mobileReleasePath = '/api/mobile/release'

/** Where the releases' files are served, each release under its bundle id (see `mobileReleaseBasePath`). */
export const mobileReleasesPath = '/api/mobile/releases'

/**
 * The updater's manifest, a JSON array of `{ href, checksum, sizeInBytes }` (checksum the file's sha256 in hex): the
 * file name `@capawesome/capacitor-live-update` reads in a release and in the app's own files.
 */
export const releaseManifestFile = 'capawesome-live-update-manifest.json'

/**
 * A signed release's statement, `{ payload, signature }`: `payload` the lowercase hex of the JSON `ReleaseBinding`,
 * and `signature` the lowercase hex of the SHA256withRSA of `releaseStatementContext` followed by those decoded bytes. It binds the
 * manifest to the release's order, app, binary and shell, which the per-file signatures say nothing of.
 */
export const releaseStatementFile = 'protobase-release.json'

/** What a statement's signature covers ahead of its payload, so no signed file of the app reads as a statement. */
export const releaseStatementContext = 'protobase-mobile-release\n'

/**
 * What a statement binds a release to: its manifest's sha256 in hex, its `order` (compared element by element, a
 * device takes only a release above its own), the app id and native fingerprint of the binaries it runs on, and the
 * Protobase version of the server, whose shells it works with.
 */
export type ReleaseBinding = { manifest: string; order: number[]; appId: string; fingerprint: string; shellVersion: string }

/**
 * The base URL path of the release `bundleId`: the updater fetches `<base>?href=<file>` for its manifest and each file.
 * The id sits in the path because the iOS updater replaces the base URL's whole query when it adds `href`.
 */
export const mobileReleaseBasePath = (bundleId: string) => `${mobileReleasesPath}/${encodeURIComponent(bundleId)}`

/** The query of the mobile release answer for a binary of `fingerprint` running a shell of `shellVersion`. */
export const mobileReleaseQuery = ({ fingerprint, shellVersion }: { fingerprint: string; shellVersion: string }) =>
  new URLSearchParams({ [mobileReleaseParams.fingerprint]: fingerprint, [mobileReleaseParams.shellVersion]: shellVersion }).toString()

/**
 * The mobile release answer: the release the device should run, `bundleId` and `url` (the absolute base URL) both
 * null when none runs on its binary, and whether the update is required, since the shell it runs no longer works with
 * the server's API.
 */
export type MobileReleaseAnswer = { bundleId: string | null; url: string | null; required: boolean }
