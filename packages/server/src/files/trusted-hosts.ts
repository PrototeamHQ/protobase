import type { FileProvider } from './store'

const hostPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

// A host name as the config writes it, lowercase, without a scheme, port or path: `images.example.com`.
const checkedHost = (host: string) => {
  if (!hostPattern.test(host)) throw new Error(`files.trustedHosts: "${host}" is not a host name; write it like images.example.com, without https:// or a path`)
  return host
}

// The host a public provider links its files from, when that is another site than the app's own.
const providerHost = (provider: FileProvider) => (provider.publicUrl !== undefined && URL.canParse(provider.publicUrl) ? [new URL(provider.publicUrl).hostname] : [])

/**
 * The hosts whose images the app draws with the page's referrer, besides its own: those its providers link public files
 * from, and those the config adds. Every other image is drawn with `referrerPolicy="no-referrer"`.
 */
export const trustedImageHosts = (providers: Record<string, FileProvider>, configured: readonly string[] = []) =>
  [...new Set([...Object.values(providers).flatMap(providerHost), ...configured.map(checkedHost)])].sort()
