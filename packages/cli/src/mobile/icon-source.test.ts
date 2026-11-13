import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import realSharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { readIconSource } from './icon-source'
import { iconPng, iconSvg, pixel, sharp } from './icon-source-fixture'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const project = (file: string, content: Buffer | string) => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-icon-source-'))
  writeFileSync(path.join(dir, file), content)
  return dir
}

describe('readIconSource', () => {
  it('draws a large PNG at 1024 pixels, keeping its transparency', async () => {
    const source = await readIconSource(sharp, project('icon.png', await iconPng(2048)), 'icon.png')
    expect(pngSize(source.image)).toEqual({ width: 1024, height: 1024 })
    expect(source.opaque).toBe(false)
    expect(await pixel(source.image, 0, 0)).toEqual([0, 0, 0, 0])
    expect(await pixel(source.image, 512, 512)).toEqual([225, 29, 72, 255])
  })

  it('says whether the source has no transparency', async () => {
    expect((await readIconSource(sharp, project('icon.png', await iconPng(1024, 1024, { opaque: true })), 'icon.png')).opaque).toBe(true)
  })

  it('draws a square SVG at 1024 pixels, however small its own size', async () => {
    const source = await readIconSource(sharp, project('icon.svg', iconSvg(24)), 'icon.svg')
    expect(pngSize(source.image)).toEqual({ width: 1024, height: 1024 })
    expect(await pixel(source.image, 512, 512)).toEqual([225, 29, 72, 255])
  })

  it('refuses a missing file, naming the setting', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-icon-source-'))
    await expect(readIconSource(sharp, dir, 'icon.png')).rejects.toThrow(`mobile.icon names icon.png, which does not exist: ${path.join(dir, 'icon.png')}`)
  })

  it('refuses a file that is no PNG or SVG', async () => {
    const jpeg = await realSharp(await iconPng(1024, 1024, { opaque: true })).jpeg().toBuffer()
    await expect(readIconSource(sharp, project('icon.png', jpeg), 'icon.png')).rejects.toThrow('mobile.icon names icon.png, which is no PNG or SVG: the icon must be a PNG or an SVG')
  })

  it('refuses a source that is not square', async () => {
    await expect(readIconSource(sharp, project('icon.png', await iconPng(1200, 1024)), 'icon.png')).rejects.toThrow('mobile.icon names icon.png, which is 1200x1024 pixels: the icon must be square')
    await expect(readIconSource(sharp, project('icon.svg', iconSvg(24, 20)), 'icon.svg')).rejects.toThrow('mobile.icon names icon.svg, which is 24x20 pixels: the icon must be square')
  })

  it('refuses a PNG smaller than 1024 pixels', async () => {
    await expect(readIconSource(sharp, project('icon.png', await iconPng(512)), 'icon.png')).rejects.toThrow('mobile.icon names icon.png, which is 512x512 pixels: a PNG icon must be at least 1024x1024')
  })
})
