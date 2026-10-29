import { authBasePath, capacitorOrigin } from '@protobase/schema/internal'

/** What the iOS and Android app's native bridge, `window.Capacitor`, offers the page; the shell never imports Capacitor. */
export type NativeBridge = {
  isNativePlatform(): boolean
  getPlatform(): string
  isPluginAvailable(name: string): boolean
  nativePromise(plugin: string, method: string, options: object): Promise<unknown>
  /** What a plugin's call rejects with. */
  Exception?: abstract new (...args: never[]) => Error
}

type NativeResponse = { status: number; headers: Record<string, string>; data: unknown }

/** The native bridge of the page, when it runs in the iOS or Android app; `undefined` in a browser. */
export const nativeBridgeOf = (win: { Capacitor?: NativeBridge }) => (win.Capacitor?.isNativePlatform() ? win.Capacitor : undefined)

// Statuses whose Response may have no body.
const nullBodyStatuses = [101, 204, 205, 304]

// An encoded slash or backslash, which `new URL` keeps as it is and the server may decode into a path separator.
const encodedSeparator = /%2f|%5c/i

const isPlatform = (platform: string): platform is keyof typeof capacitorOrigin => Object.hasOwn(capacitorOrigin, platform)

const allowedUrl = (url: URL, apiOrigin: string) =>
  url.origin === apiOrigin && !url.username && !url.password && url.pathname.startsWith(`${authBasePath}/`) && !encodedSeparator.test(url.pathname)

const bodyOf = ({ status, headers, data }: NativeResponse) => {
  if (nullBodyStatuses.includes(status)) return null
  // Native code hands JSON back parsed, a top-level string without its quotes, so JSON is always written out again.
  const json = Object.entries(headers).some(([name, value]) => name.toLowerCase() === 'content-type' && value.startsWith('application/json'))
  if (json) return JSON.stringify(data)
  return typeof data === 'string' ? data : JSON.stringify(data)
}

/**
 * A `fetch` for the app's sign-in, at `<apiOrigin>/api/auth/...` only, through native HTTP in Protobase's own
 * ProtobaseAuth plugin, which checks the address again, refuses redirects and keeps Set-Cookie from the page itself:
 * the session cookie lives in the device's cookie jar, which native HTTP sends and keeps, and the request names the
 * Capacitor origin of the platform, which the server trusts for sign-in with a mobile section. The page cannot set
 * `Cookie`, so the cookie comes from the native jar alone. Any other address is refused before the bridge is called.
 */
export const nativeAuthFetch = (bridge: NativeBridge, apiOrigin: string): typeof fetch => {
  const platform = bridge.getPlatform()
  if (!isPlatform(platform)) throw new Error(`Signing in through native HTTP is for iOS and Android, not ${platform}`)
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (!allowedUrl(url, apiOrigin)) throw new Error(`Native sign-in requests go to ${apiOrigin}${authBasePath}/ only, not ${request.url}`)
    const withBody = request.method !== 'GET' && request.method !== 'HEAD'
    const answer = (await bridge.nativePromise('ProtobaseAuth', 'request', {
      url: url.href,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      ...(withBody && { data: await request.text() }),
    })) as NativeResponse
    // Set-Cookie is left to the native cookie jar; a Response would drop it anyway.
    const headers = Object.entries(answer.headers).filter(([name]) => name.toLowerCase() !== 'set-cookie')
    return new Response(bodyOf(answer), { status: answer.status, headers })
  }
}
