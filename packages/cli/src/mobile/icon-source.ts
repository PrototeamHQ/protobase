import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Sharp } from './icon-sharp'

/** The size every icon is drawn from: the App Store icon's, the largest one. */
export const sourceSize = 1024

/** An image of the project, such as the app's own icon at `sourceSize`, square with its transparency, and whether it has none. */
export type IconSource = { image: Buffer; opaque: boolean }

/** What `readSquareImage` reads: the setting naming the file, what the image is, in the errors, and the size to draw it at. */
export type SquareImage = { setting: string; noun: string; size: number }

/**
 * Reads the image `file` the setting names from the project's folder `projectDir`: a square PNG of at least `size`
 * pixels, or a square SVG, drawn at that size. Any other file stops the build, naming the setting and the rule, since
 * the platforms would take a wrong one quietly.
 */
export const readSquareImage = async (sharp: Sharp, projectDir: string, file: string, { setting, noun, size }: SquareImage): Promise<IconSource> => {
  const at = path.resolve(projectDir, file)
  if (!existsSync(at)) throw new Error(`${setting} names ${file}, which does not exist: ${at}`)
  const { format, width = 0, height = 0 } = await sharp(at).metadata()
  if (format !== 'png' && format !== 'svg') throw new Error(`${setting} names ${file}, which is no PNG or SVG: the ${noun} must be a PNG or an SVG`)
  if (width === 0 || width !== height) throw new Error(`${setting} names ${file}, which is ${width}x${height} pixels: the ${noun} must be square`)
  if (format === 'png' && width < size) throw new Error(`${setting} names ${file}, which is ${width}x${height} pixels: a PNG ${noun} must be at least ${size}x${size}`)
  // An SVG is drawn at the density that makes it `size` pixels wide, rather than enlarged after drawing.
  const input = format === 'svg' ? sharp(at, { density: (72 * size) / width }) : sharp(at)
  const image = await input.resize(size, size).ensureAlpha().png().toBuffer()
  return { image, opaque: (await sharp(image).stats()).isOpaque }
}

/** Reads the app's icon `file`, `mobile.icon`: a square PNG of at least `sourceSize` pixels, or a square SVG. */
export const readIconSource = (sharp: Sharp, projectDir: string, file: string) => readSquareImage(sharp, projectDir, file, { setting: 'mobile.icon', noun: 'icon', size: sourceSize })
