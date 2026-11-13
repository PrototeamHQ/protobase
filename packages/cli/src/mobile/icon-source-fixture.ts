import { fileURLToPath } from 'node:url'
import { loadSharp } from './icon-sharp'

/** For tests: the sharp @protobase/mobile brings, loaded from this repository's package as from a workspace. */
export const sharp = loadSharp(fileURLToPath(new URL('../../../mobile', import.meta.url)))

/** For tests: an SVG of a red circle, `width` by `height` units, on a transparent background or on an opaque blue one. */
export const iconSvg = (width: number, height = width, { opaque = false } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${opaque ? '<rect width="100%" height="100%" fill="#0000ff"/>' : ''}<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#e11d48"/></svg>`

/** For tests: `iconSvg` as a PNG. */
export const iconPng = (width: number, height = width, options: { opaque?: boolean } = {}) => sharp(Buffer.from(iconSvg(width, height, options))).png().toBuffer()

/** For tests: the icon source `readIconSource` reads from a 1024 pixel PNG. */
export const iconSource = async (png: Buffer) => ({ image: await sharp(png).ensureAlpha().png().toBuffer(), opaque: (await sharp(png).stats()).isOpaque })

// The calls `pixel` makes, which the icon modules do not.
type RawImage = { ensureAlpha(): RawImage; raw(): RawImage; toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number } }> }

/** For tests: the RGBA pixel of a PNG at `x`, `y`. */
export const pixel = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await (sharp as unknown as (input: Buffer) => RawImage)(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * 4
  return [...data.subarray(at, at + 4)]
}
