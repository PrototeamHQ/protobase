import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { loadMobileProject } from './load-project'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'protobase-mobile-project-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

it('reads a config function as the deploy bundle does, so push agrees with the manifest', async () => {
  await writeFile(path.join(dir, 'protobase.config.ts'), "export default ({ command }: { command: string }) => ({ mobile: { appId: 'net.example.shop' }, ...(command === 'build' && { notifications: {} }) })\n")
  expect(await loadMobileProject(dir, [])).toMatchObject({ mobile: { appId: 'net.example.shop' }, notifications: true })
})
