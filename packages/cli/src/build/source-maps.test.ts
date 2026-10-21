import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { moveSourceMaps } from './source-maps'

let dir = ''
afterEach(() => rm(dir, { recursive: true, force: true }))

it('moves every source map to the same place in the other folder, leaving the other files', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'protobase-source-maps-'))
  const from = path.join(dir, 'shell')
  await mkdir(path.join(from, 'assets'), { recursive: true })
  for (const file of ['index.html', 'assets/index-a1.js', 'assets/index-a1.js.map', 'assets/chunk-b2.js', 'assets/chunk-b2.js.map']) await writeFile(path.join(from, file), '')
  await moveSourceMaps(from, path.join(dir, 'maps'))
  expect((await readdir(from, { recursive: true })).sort()).toEqual(['assets', 'assets/chunk-b2.js', 'assets/index-a1.js', 'index.html'])
  expect((await readdir(path.join(dir, 'maps'), { recursive: true })).sort()).toEqual(['assets', 'assets/chunk-b2.js.map', 'assets/index-a1.js.map'])
})
