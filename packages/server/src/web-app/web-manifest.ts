/** Where the app's favicon is on its own origin, which `protobase build` and `protobase dev` always answer. */
export const faviconPath = '/protobase.favicon.svg'

/**
 * The web app manifest that makes the admin app installable: named for the app, opening at its home page in a window
 * of its own, with the favicon as its icon. An SVG with `sizes: "any"` meets Chrome's 192 and 512 pixel icon sizes.
 */
export const webManifest = (appName: string) => ({
  name: appName,
  short_name: appName,
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  icons: [{ src: faviconPath, sizes: 'any', type: 'image/svg+xml' }],
})
