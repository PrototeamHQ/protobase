import type { KeyObject } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { MobileConfig } from '@protobase/server'
import { composeRelease, nativeFingerprint, releaseOrder, withApiOrigin, type OfferedRelease } from '@protobase/server/mobile-release'
import type { ServedSite } from './app'
import { siteFiles } from './site-files'

const loopback = ['localhost', '127.0.0.1', '[::1]']

/**
 * The API origin a release names, the app's URL (`url`), as the app's own files do by default: https, or plain
 * http to this machine only, as `protobase mobile` allows it. `undefined` for any other, which no app calls.
 */
export const releaseOrigin = (issuer: string | undefined) => {
  if (issuer === undefined || !URL.canParse(issuer)) return undefined
  const url = new URL(issuer)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && loopback.includes(url.hostname))) return url.origin
  return undefined
}

export type ServedReleaseInput = { site?: ServedSite; mobile?: MobileConfig; issuer?: string; signingKey?: KeyObject; serverVersion: string }

/**
 * The release of the app's files a server offers its mobile app: every file the site serves, its SPA page naming the
 * API origin as the app's own files do, for binaries of the fingerprint of the site's native packages and the project's
 * plugins. Signed, its statement binds it to its order, the app id, that fingerprint and the server's Protobase version.
 * None without a mobile section, without the site's files (the API alone, whose files a host serves), a site that
 * names no native packages (a bundle built before them), an API origin an app calls, or, signed, an order.
 */
export const servedRelease = async ({ site, mobile, issuer, signingKey, serverVersion }: ServedReleaseInput): Promise<OfferedRelease | undefined> => {
  const origin = releaseOrigin(issuer)
  if (!mobile || !site?.native || !origin) return undefined
  const order = releaseOrder(site)
  if (signingKey && !order) return undefined
  const fingerprint = nativeFingerprint(site.native, mobile.plugins)
  const files = await Promise.all(
    (await siteFiles(site)).map(async ({ href, file }) => ({
      href,
      content: href === site.spa ? new TextEncoder().encode(withApiOrigin(await readFile(file, 'utf8'), origin)) : new Uint8Array(await readFile(file)),
    })),
  )
  const signing = signingKey && order && { key: signingKey, binding: { order, appId: mobile.appId, fingerprint, shellVersion: serverVersion } }
  return { ...composeRelease(files, signing), fingerprint, origin }
}
