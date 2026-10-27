import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { faviconIcoFile } from './favicon-ico'

let dir = ''
afterEach(() => rm(dir, { recursive: true, force: true }))

it('is the smallest PNG icon the folder has, else its favicon, else none', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'protobase-favicon-ico-'))
  expect(faviconIcoFile(dir)).toBeUndefined()
  await writeFile(path.join(dir, 'protobase.favicon.svg'), '<svg/>')
  expect(faviconIcoFile(dir)).toBe(path.join(dir, 'protobase.favicon.svg'))
  await writeFile(path.join(dir, 'protobase.icon-512.png'), 'png')
  expect(faviconIcoFile(dir)).toBe(path.join(dir, 'protobase.icon-512.png'))
  await writeFile(path.join(dir, 'protobase.apple-touch-icon.png'), 'png')
  expect(faviconIcoFile(dir)).toBe(path.join(dir, 'protobase.apple-touch-icon.png'))
  await writeFile(path.join(dir, 'protobase.icon-192.png'), 'png')
  expect(faviconIcoFile(dir)).toBe(path.join(dir, 'protobase.icon-192.png'))
})
