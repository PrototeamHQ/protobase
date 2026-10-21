import { existsSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pngIcons, type AppIcons, type PngIcon } from '@protobase/server'
import { buildFavicon, faviconFile } from './favicon'

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The width and height of a PNG, from its signature and IHDR chunk; `undefined` for a file that is no PNG. */
export const pngSize = (head: Buffer) => {
  if (head.length < 24 || !head.subarray(0, 8).equals(pngSignature) || head.toString('latin1', 12, 16) !== 'IHDR') return undefined
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

// A PNG that is not one, or not its square size, fails the build: the platforms that take it would ignore it quietly.
const checkPng = async (projectDir: string, icon: PngIcon) => {
  const { file, size } = pngIcons[icon]
  const found = pngSize(await readFile(path.join(projectDir, file)))
  if (!found) throw new Error(`${file} is no PNG`)
  if (found.width !== size || found.height !== size) throw new Error(`${file} is ${found.width}x${found.height} pixels; it must be ${size}x${size}`)
}

/** The icons the project in `projectDir` has of its own: its protobase.favicon.svg and the PNGs beside it (see `pngIcons`). */
export const projectIcons = (projectDir: string): AppIcons => ({
  favicon: existsSync(path.join(projectDir, faviconFile)),
  png: (Object.keys(pngIcons) as PngIcon[]).filter((icon) => existsSync(path.join(projectDir, pngIcons[icon].file))),
})

/**
 * Writes the app's icons into `publicDir`: the favicon, the project's or Protobase's (see `buildFavicon`), and the PNGs
 * the project has, each checked to be its size. Says which are the project's own, which the server's manifest names.
 */
export const buildIcons = async ({ projectDir, publicDir }: { projectDir: string; publicDir: string }) => {
  const icons = projectIcons(projectDir)
  for (const icon of icons.png) await checkPng(projectDir, icon)
  await buildFavicon({ projectDir, outFile: path.join(publicDir, faviconFile) })
  await Promise.all(icons.png.map((icon) => copyFile(path.join(projectDir, pngIcons[icon].file), path.join(publicDir, pngIcons[icon].file))))
  return icons
}
