import type { KeyObject } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { composeRelease, type MobileConfig, type OfferedRelease } from '@protobase/server'
import { nativeFingerprint } from '../mobile/fingerprint'
import { withApiOrigin } from '../mobile/api-origin-page'
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

export type ServedReleaseInput = { site?: ServedSite; mobile?: MobileConfig; issuer?: string; signingKey?: KeyObject }

/**
 * The release of the app's files a server offers its mobile app: every file the site serves, its SPA page naming the
 * API origin as the app's own files do, for binaries of the fingerprint of the site's native packages and the project's
 * plugins. None without a mobile section, without the site's files (the API alone, whose files a host serves), a
 * site that names no native packages (a bundle built before them) or an API origin an app calls.
 */
export const servedRelease = async ({ site, mobile, issuer, signingKey }: ServedReleaseInput): Promise<OfferedRelease | undefined> => {
  const origin = releaseOrigin(issuer)
  if (!mobile || !site?.native || !origin) return undefined
  const files = await Promise.all(
    (await siteFiles(site)).map(async ({ href, file }) => ({
      href,
      content: href === site.spa ? new TextEncoder().encode(withApiOrigin(await readFile(file, 'utf8'), origin)) : new Uint8Array(await readFile(file)),
    })),
  )
  return { ...composeRelease(files, signingKey), fingerprint: nativeFingerprint(site.native, mobile.plugins), origin }
}
