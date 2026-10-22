import { Hono } from 'hono'
import { getMimeType } from 'hono/utils/mime'
import { mobileReleaseBasePath, mobileReleaseParams, mobileReleasePath, mobileReleasesPath, type MobileReleaseAnswer } from '@protobase/schema/internal'
import { badRequest, notFound, problemResponse, type HttpProblem } from '../problem'
import type { MobileRelease } from './release'
import { isShellVersion, shellUpdateRequired } from './shell-update'

/** The release a server offers: its files, the native fingerprint of the binaries it runs on and the API origin it calls. */
export type OfferedRelease = MobileRelease & { fingerprint: string; origin: string }

export type MobileReleaseAppInput = {
  /** `undefined` when the server serves no release, such as the API alone, whose app files a host serves. */
  release?: OfferedRelease
  /** The server's Protobase version, which the shell a device runs must work with. */
  serverVersion: string
}

/**
 * The live updater's routes. `GET /api/mobile/release` tells a device the release it should run: the server's own,
 * when it runs on the device's binary, and whether the update is required. `GET /api/mobile/releases/<bundle id>?href=`
 * serves the release's manifest and files, each with its sha256 in `X-Checksum` and, signed, its `X-Signature`, which
 * the updater checks each file against: it never checks a file against the manifest.
 */
export const mobileReleaseApp = ({ release, serverVersion }: MobileReleaseAppInput) =>
  new Hono()
    .get(mobileReleasePath, (c) => {
      const problem = (error: HttpProblem) => problemResponse(error, c.req.path)
      const fingerprint = c.req.query(mobileReleaseParams.fingerprint)
      const shellVersion = c.req.query(mobileReleaseParams.shellVersion)
      if (!fingerprint) return problem(badRequest('invalid-fingerprint', `${mobileReleaseParams.fingerprint} must name the native fingerprint of the app`))
      if (!shellVersion || !isShellVersion(shellVersion)) return problem(badRequest('invalid-shell-version', `${mobileReleaseParams.shellVersion} must be the x.y.z Protobase version of the shell the app runs`))
      const offered = release?.fingerprint === fingerprint ? release : undefined
      const answer: MobileReleaseAnswer = {
        bundleId: offered?.bundleId ?? null,
        url: offered ? `${offered.origin}${mobileReleaseBasePath(offered.bundleId)}` : null,
        required: shellUpdateRequired(shellVersion, serverVersion),
      }
      // Public, and read by the app's page on its own origin.
      return c.json(answer, 200, { 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
    })
    .get(`${mobileReleasesPath}/:bundleId`, (c) => {
      const href = c.req.query('href') ?? ''
      const file = release && c.req.param('bundleId') === release.bundleId ? release.files.get(href) : undefined
      if (!file) return problemResponse(notFound('The release has no such file, or is no longer served'), c.req.path)
      return c.body(file.content as Uint8Array<ArrayBuffer>, 200, {
        'content-type': getMimeType(href) ?? 'application/octet-stream',
        // A release's id is a hash of its files, so what it serves never changes.
        'cache-control': 'public, max-age=31536000, immutable',
        'x-checksum': file.checksum,
        ...(file.signature && { 'x-signature': file.signature }),
      })
    })
