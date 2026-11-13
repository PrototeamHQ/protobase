import { createRequire } from 'node:module'
import path from 'node:path'
import { installedPackage } from './installed-package'

// The calls made on an image, as sharp's types declare them, so the CLI needs no types of its own from sharp.
type Image = {
  metadata(): Promise<{ format?: string; width?: number; height?: number }>
  stats(): Promise<{ isOpaque: boolean }>
  resize(width: number, height: number): Image
  extract(region: { left: number; top: number; width: number; height: number }): Image
  extend(options: { top: number; bottom: number; left: number; right: number; background: { r: number; g: number; b: number; alpha: number } }): Image
  flatten(options: { background: string }): Image
  greyscale(): Image
  ensureAlpha(): Image
  composite(images: Array<{ input: Buffer; blend: 'dest-in' }>): Image
  png(): Image
  toBuffer(): Promise<Buffer>
}

/** sharp's default export, as `import sharp from 'sharp'` gives it. */
export type Sharp = (input: Buffer | string, options?: { density?: number }) => Image

const require = createRequire(import.meta.url)

/**
 * The sharp @protobase/mobile brings into the workspace `ws`, loaded by path, never by Node's lookup, which would go on
 * into the project's own node_modules: the CLI itself carries no image library.
 */
export const loadSharp = (ws: string) => {
  installedPackage(ws, 'sharp')
  return require(path.join(ws, 'node_modules', 'sharp')) as Sharp
}
