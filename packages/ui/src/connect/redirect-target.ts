/**
 * Where the connect page says an allowed client's code goes, from its redirect URI: a `site` by its host (in punycode,
 * as `URL` gives it, so an international name cannot pass for another), `this-computer` for a loopback address by its
 * port, or a `device-app` by the whole URI without its query, since a custom scheme's host is whatever the client
 * chose (`x-any://claude.ai/cb` is no page of claude.ai).
 */
export type RedirectTarget = { kind: 'site'; host: string } | { kind: 'this-computer'; port: string } | { kind: 'device-app'; uri: string }

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']
// Schemes that run or show content in the page instead of handing the code to an app.
const unsafeSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']

/** Where `redirectUri` sends the code, or `undefined` for one the page will not send it to. */
export const redirectTarget = (redirectUri: string): RedirectTarget | undefined => {
  if (!URL.canParse(redirectUri)) return undefined
  const url = new URL(redirectUri)
  if (url.protocol === 'https:') return { kind: 'site', host: url.host }
  if (url.protocol === 'http:') return loopbackHosts.includes(url.hostname) ? { kind: 'this-computer', port: url.port || '80' } : undefined
  if (unsafeSchemes.includes(url.protocol)) return undefined
  return { kind: 'device-app', uri: redirectUri.split('?')[0]!.split('#')[0]! }
}

/** Whether `url` is one the page may send the browser to: anything but a scheme that runs or shows content in the page. */
export const isSafeTarget = (url: string) => !URL.canParse(url, 'http://local') || !unsafeSchemes.includes(new URL(url, 'http://local').protocol)
