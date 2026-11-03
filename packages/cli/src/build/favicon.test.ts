import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { adminAppDir } from '../project/admin-app'
import { projectFavicon } from './favicon'

let projectDir = ''
afterEach(() => rm(projectDir, { recursive: true, force: true }))

it("is the project's protobase.favicon.svg, or the neutral mark beside the app's index.html without one", async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-favicon-'))
  expect(projectFavicon(projectDir)).toBe(path.join(adminAppDir, 'favicon.svg'))
  expect(projectFavicon(undefined)).toBe(path.join(adminAppDir, 'favicon.svg'))
  await writeFile(path.join(projectDir, 'protobase.favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  expect(projectFavicon(projectDir)).toBe(path.join(projectDir, 'protobase.favicon.svg'))
})

it("is a neutral mark without one, not Protobase's", async () => {
  const svg = await readFile(projectFavicon(undefined), 'utf8')
  // The Protobase mark's signal-coloured corner
  expect(svg).not.toMatch(/#FF5A1F|#FF6A33|evenodd/i)
})
