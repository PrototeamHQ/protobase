import { createHash, createPublicKey, sign, type KeyObject } from 'node:crypto'
import { releaseManifestFile, releaseStatementContext, releaseStatementFile, type ReleaseBinding } from '@protobase/schema/internal'
import { releaseStatement } from './release-statement'

/** A file of a release: its path inside the app's files, such as `assets/index-abc123.js`, and its bytes. */
export type ReleaseFile = { href: string; content: Uint8Array }

/** A file as the updater gets it: its bytes, their sha256 in hex and, with a signing key, their signature. */
export type ServedReleaseFile = { content: Uint8Array; checksum: string; signature?: string }

/**
 * A release of the app's files: its bundle id, a hash of what binds it and of the signing key's public key, and every
 * file by `href`, the manifest and, signed, the statement included.
 */
export type MobileRelease = { bundleId: string; files: Map<string, ServedReleaseFile> }

/** How a release is signed: the key, and what its statement binds it to beside the manifest. */
export type ReleaseSigning = { key: KeyObject; binding: Omit<ReleaseBinding, 'manifest'> }

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex')

/** The updater's manifest of `files`: each one's `href`, sha256 in hex and size, in the order of their hrefs. */
export const releaseManifest = (files: ReleaseFile[]) =>
  [...files]
    .sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0))
    .map(({ href, content }) => ({ href, checksum: sha256(content), sizeInBytes: content.byteLength }))

// SHA256withRSA in base64, as the updater verifies `X-Signature` against the app's public key.
const signature = (content: Uint8Array, key: KeyObject) => sign('sha256', content, key).toString('base64')

// What signs the files: the public key of `signingKey`, or nothing. It is part of the bundle id, so a response cached
// under a release's URL never carries another key's signature, or none where one is now expected.
const signer = (signingKey?: KeyObject) => (signingKey ? createPublicKey(signingKey).export({ type: 'spki', format: 'der' }) : new Uint8Array())

const context = new TextEncoder().encode(releaseStatementContext)
const startsWithContext = (content: Uint8Array) => content.byteLength >= context.byteLength && context.every((byte, i) => content[i] === byte)

/**
 * The release of `files`, each hashed and, with `signing`, signed once here. Its manifest is served as a file of its
 * own and, signed, so is its statement, so a file of the app may not have their names. Signed, the id hashes the
 * statement, which holds the manifest's hash, so the same files released in another order get another id.
 */
export const composeRelease = (files: ReleaseFile[], signing?: ReleaseSigning): MobileRelease => {
  for (const name of [releaseManifestFile, releaseStatementFile]) {
    if (files.some((file) => file.href === name)) throw new Error(`The app's files have a ${name}, the name of a file of the updater's: rename it`)
  }
  const signed = files.find((file) => startsWithContext(file.content))
  if (signed) throw new Error(`The app's file ${signed.href} starts as a release statement's signed bytes do: change its first line`)
  const manifest = new TextEncoder().encode(JSON.stringify(releaseManifest(files)))
  const statement = signing && releaseStatement({ manifest: sha256(manifest), ...signing.binding }, signing.key)
  const served = (content: Uint8Array): ServedReleaseFile => ({ content, checksum: sha256(content), ...(signing && { signature: signature(content, signing.key) }) })
  return {
    bundleId: createHash('sha256').update(statement ?? manifest).update(signer(signing?.key)).digest('hex').slice(0, 16),
    files: new Map([
      ...files.map(({ href, content }) => [href, served(content)] as const),
      [releaseManifestFile, served(manifest)],
      ...(statement ? [[releaseStatementFile, served(statement)] as const] : []),
    ]),
  }
}
