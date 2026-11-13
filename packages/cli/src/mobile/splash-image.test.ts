import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { splashSourceSize } from './android-splash-image'
import { iconPng } from './icon-source-fixture'
import { splashImage } from './splash-image'

// The repository's @protobase/mobile, which brings sharp, as an installed workspace's.
const ws = fileURLToPath(new URL('../../../mobile', import.meta.url))

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const project = async (files: Record<string, number>) => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-splash-image-'))
  for (const [file, size] of Object.entries(files)) writeFileSync(path.join(dir, file), await iconPng(size))
  return dir
}

describe('splashImage', () => {
  it('gives no files without an image', async () => {
    expect(await splashImage({ ws, projectDir: await project({}), splash: { background: '#0d9488' }, platform: 'ios' })).toBeUndefined()
    expect(await splashImage({ ws, projectDir: await project({}), splash: undefined, platform: 'android' })).toBeUndefined()
  })

  it("draws the light and dark images for the platform", async () => {
    const projectDir = await project({ 'splash.png': splashSourceSize, 'splash-dark.png': splashSourceSize })
    const files = await splashImage({ ws, projectDir, splash: { image: 'splash.png', dark: { image: 'splash-dark.png' } }, platform: 'android' })
    expect(files?.filter(({ file }) => file.includes('drawable-night-'))).toHaveLength(5)
  })

  it('refuses a missing or small image, naming the setting', async () => {
    const projectDir = await project({ 'splash.png': splashSourceSize, 'small.png': 1024 })
    await expect(splashImage({ ws, projectDir, splash: { image: 'gone.png' }, platform: 'ios' })).rejects.toThrow('mobile.splash.image names gone.png, which does not exist')
    await expect(splashImage({ ws, projectDir, splash: { image: 'splash.png', dark: { image: 'gone.png' } }, platform: 'ios' })).rejects.toThrow('mobile.splash.dark.image names gone.png, which does not exist')
    await expect(splashImage({ ws, projectDir, splash: { image: 'small.png' }, platform: 'ios' })).rejects.toThrow('mobile.splash.image names small.png, which is 1024x1024 pixels: a PNG splash image must be at least 1152x1152')
  })
})
