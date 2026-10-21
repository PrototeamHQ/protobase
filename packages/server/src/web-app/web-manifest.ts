import type { AppIdentity } from '../app-identity'
import { pngIcons, type AppIcons, type PngIcon } from './app-icons'

/** Where the app's favicon is on its own origin, which `protobase build` and `protobase dev` always answer. */
export const faviconPath = '/protobase.favicon.svg'

// The PNGs the manifest names, of those a project may have; the Apple touch icon is the page's to link.
const manifestIcons = { icon192: 'any', icon512: 'any', maskable: 'maskable' } as const

const isManifestIcon = (icon: PngIcon): icon is keyof typeof manifestIcons => icon in manifestIcons

const manifestIcon = (icon: keyof typeof manifestIcons) => {
  const { file, size } = pngIcons[icon]
  return { src: `/${file}`, sizes: `${size}x${size}`, type: 'image/png', ...(manifestIcons[icon] === 'maskable' && { purpose: 'maskable' }) }
}

/**
 * The web app manifest that makes the admin app installable: named for the app, opening at its home page in a window
 * of its own, with the favicon as its icon, the project's PNGs beside it and its colours when it has them. An SVG with
 * `sizes: "any"` meets Chrome's 192 and 512 pixel icon sizes; Safari and some Android launchers take only PNGs.
 */
export const webManifest = (appName: string, { themeColor, backgroundColor }: AppIdentity = {}, icons?: AppIcons) => ({
  name: appName,
  short_name: appName,
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  ...(themeColor && { theme_color: themeColor }),
  ...(backgroundColor && { background_color: backgroundColor }),
  icons: [{ src: faviconPath, sizes: 'any', type: 'image/svg+xml' }, ...(icons?.png ?? []).filter(isManifestIcon).map(manifestIcon)],
})
