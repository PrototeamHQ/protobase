/**
 * The PNG icons a project may put beside its `protobase.favicon.svg`, for platforms that take no SVG, each square at
 * `size` pixels and answered on the app's own origin at `/<file>`: Android's 192 and 512 pixel icons, a 512 pixel
 * maskable one whose mark keeps to the middle 80%, and the 180 pixel Apple touch icon an iPhone home screen shows.
 */
export const pngIcons = {
  icon192: { file: 'protobase.icon-192.png', size: 192 },
  icon512: { file: 'protobase.icon-512.png', size: 512 },
  maskable: { file: 'protobase.icon-maskable.png', size: 512 },
  appleTouch: { file: 'protobase.apple-touch-icon.png', size: 180 },
} as const

export type PngIcon = keyof typeof pngIcons

/** The icons a project has of its own: `favicon` when the favicon is its own rather than Protobase's, and its PNGs. */
export type AppIcons = { favicon: boolean; png: PngIcon[] }
