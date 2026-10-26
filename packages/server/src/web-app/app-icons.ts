import { pngIcons } from '@protobase/schema/png-icons'

// In @protobase/schema/png-icons, so the CLI's dev server links the icons without loading this package or zod.
export { pngIcons }

export type PngIcon = keyof typeof pngIcons

/** The icons a project has of its own: `favicon` when the favicon is its own rather than Protobase's, and its PNGs. */
export type AppIcons = { favicon: boolean; png: PngIcon[] }
