import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testPng } from '../../tests/support/png'
import { buildIcons, pngSize, projectIcons } from './app-icons'

let projectDir = ''
let publicDir = ''
beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-icons-'))
  publicDir = await mkdtemp(path.join(tmpdir(), 'protobase-icons-public-'))
})
afterEach(() => Promise.all([rm(projectDir, { recursive: true, force: true }), rm(publicDir, { recursive: true, force: true })]))

describe('pngSize', () => {
  it('reads the size from the IHDR chunk, and none from a file that is no PNG', () => {
    expect(pngSize(testPng(192))).toEqual({ width: 192, height: 192 })
    expect(pngSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined()
  })
})

describe('buildIcons', () => {
  it("names nothing of the project's own without its files, and still writes Protobase's favicon", async () => {
    expect(await buildIcons({ projectDir, publicDir })).toEqual({ favicon: false, png: [] })
    expect(await readFile(path.join(publicDir, 'protobase.favicon.svg'), 'utf8')).toContain('<svg')
  })

  it("copies the project's favicon and PNGs and names them", async () => {
    await writeFile(path.join(projectDir, 'protobase.favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await writeFile(path.join(projectDir, 'protobase.icon-512.png'), testPng(512))
    await writeFile(path.join(projectDir, 'protobase.apple-touch-icon.png'), testPng(180))
    expect(projectIcons(projectDir)).toEqual({ favicon: true, png: ['icon512', 'appleTouch'] })
    expect(await buildIcons({ projectDir, publicDir })).toEqual({ favicon: true, png: ['icon512', 'appleTouch'] })
    expect(await readFile(path.join(publicDir, 'protobase.icon-512.png'))).toEqual(testPng(512))
    expect(await readFile(path.join(publicDir, 'protobase.apple-touch-icon.png'))).toEqual(testPng(180))
  })

  it('fails on a PNG of the wrong size, or a file that is no PNG', async () => {
    await writeFile(path.join(projectDir, 'protobase.icon-192.png'), testPng(192, 180))
    await expect(buildIcons({ projectDir, publicDir })).rejects.toThrow('protobase.icon-192.png is 192x180 pixels; it must be 192x192')
    await writeFile(path.join(projectDir, 'protobase.icon-192.png'), 'not a png')
    await expect(buildIcons({ projectDir, publicDir })).rejects.toThrow('protobase.icon-192.png is no PNG')
  })
})
