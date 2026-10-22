import { createHash, sign, type KeyObject } from 'node:crypto'
import { releaseManifestFile } from '@protobase/schema/internal'

/** A file of a release: its path inside the app's files, such as `assets/index-abc123.js`, and its bytes. */
export type ReleaseFile = { href: string; content: Uint8Array }

/** A file as the updater gets it: its bytes, their sha256 in hex and, with a signing key, their signature. */
export type ServedReleaseFile = { content: Uint8Array; checksum: string; signature?: string }

/** A release of the app's files: its bundle id, a hash of its manifest, and every file by `href`, the manifest included. */
export type MobileRelease = { bundleId: string; files: Map<string, ServedReleaseFile> }

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex')

/** The updater's manifest of `files`: each one's `href`, sha256 in hex and size, in the order of their hrefs. */
export const releaseManifest = (files: ReleaseFile[]) =>
  [...files]
    .sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0))
    .map(({ href, content }) => ({ href, checksum: sha256(content), sizeInBytes: content.byteLength }))

// SHA256withRSA in base64, as the updater verifies `X-Signature` against the app's public key.
const signature = (content: Uint8Array, key: KeyObject) => sign('sha256', content, key).toString('base64')

/**
 * The release of `files`, each hashed and, with `signingKey`, signed once here. Its manifest is served as a file of
 * its own, so a file of the app may not have the manifest's name.
 */
export const composeRelease = (files: ReleaseFile[], signingKey?: KeyObject): MobileRelease => {
  if (files.some((file) => file.href === releaseManifestFile)) throw new Error(`The app's files have a ${releaseManifestFile}, the name of the updater's manifest: rename it`)
  const manifest = new TextEncoder().encode(JSON.stringify(releaseManifest(files)))
  const served = (content: Uint8Array): ServedReleaseFile => ({ content, checksum: sha256(content), ...(signingKey && { signature: signature(content, signingKey) }) })
  return {
    bundleId: sha256(manifest).slice(0, 16),
    files: new Map([...files.map(({ href, content }) => [href, served(content)] as const), [releaseManifestFile, served(manifest)]]),
  }
}
