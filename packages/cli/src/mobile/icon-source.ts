import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Sharp } from './icon-sharp'

/** The size every icon is drawn from: the App Store icon's, the largest one. */
export const sourceSize = 1024

/** The app's own icon, square at `sourceSize` with its transparency, and whether it has none. */
export type IconSource = { image: Buffer; opaque: boolean }

/**
 * Reads the app's icon `file`, `mobile.icon` from the project's folder `projectDir`: a square PNG of at least
 * `sourceSize` pixels, or a square SVG, drawn at that size. Any other file stops the build, naming the setting and
 * the rule, since the platforms would take a wrong one quietly.
 */
export const readIconSource = async (sharp: Sharp, projectDir: string, file: string): Promise<IconSource> => {
  const at = path.resolve(projectDir, file)
  if (!existsSync(at)) throw new Error(`mobile.icon names ${file}, which does not exist: ${at}`)
  const { format, width = 0, height = 0 } = await sharp(at).metadata()
  if (format !== 'png' && format !== 'svg') throw new Error(`mobile.icon names ${file}, which is no PNG or SVG: the icon must be a PNG or an SVG`)
  if (width === 0 || width !== height) throw new Error(`mobile.icon names ${file}, which is ${width}x${height} pixels: the icon must be square`)
  if (format === 'png' && width < sourceSize) throw new Error(`mobile.icon names ${file}, which is ${width}x${height} pixels: a PNG icon must be at least ${sourceSize}x${sourceSize}`)
  // An SVG is drawn at the density that makes it `sourceSize` pixels wide, rather than enlarged after drawing.
  const input = format === 'svg' ? sharp(at, { density: (72 * sourceSize) / width }) : sharp(at)
  const image = await input.resize(sourceSize, sourceSize).ensureAlpha().png().toBuffer()
  return { image, opaque: (await sharp(image).stats()).isOpaque }
}
