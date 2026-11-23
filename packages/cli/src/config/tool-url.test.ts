import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { devPort, devPortFile, savePort } from '../dev/dev-port'
import { projectAuth } from './build-project'
import type { MergedConfig } from './merge-config'
import { withDevUrl } from './tool-url'

let projectDir: string
beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'tool-url-'))
})
afterEach(() => rm(projectDir, { recursive: true, force: true }))

// Only the keys sign-in reads.
const configOf = (config: Partial<MergedConfig>) => config as MergedConfig
const picks = (port: number) => (dir: string, chosen: number | undefined) => devPort(dir, chosen, async () => port)

describe('withDevUrl', () => {
  it("uses the project's kept dev port when the config has no url", async () => {
    await savePort(projectDir, 23456)
    expect((await withDevUrl(configOf({ auth: {} }), projectDir, picks(34567))).url).toBe('http://localhost:23456')
  })

  it('picks and keeps a port when dev has kept none, so a later protobase dev serves there', async () => {
    expect((await withDevUrl(configOf({ auth: {} }), projectDir, picks(34567))).url).toBe('http://localhost:34567')
    expect(await readFile(path.join(projectDir, devPortFile), 'utf8')).toBe('34567\n')
  })

  it("keeps the config's own url and keeps no port", async () => {
    expect((await withDevUrl(configOf({ auth: {}, url: 'https://admin.example.com' }), projectDir, picks(34567))).url).toBe('https://admin.example.com')
    await expect(readFile(path.join(projectDir, devPortFile))).rejects.toThrow()
  })

  it('keeps no port without sign-in', async () => {
    expect((await withDevUrl(configOf({}), projectDir, picks(34567))).url).toBeUndefined()
    await expect(readFile(path.join(projectDir, devPortFile))).rejects.toThrow()
  })
})

describe('projectAuth', () => {
  it('still refuses sign-in without a url, as serve builds it', async () => {
    await expect(projectAuth(configOf({ auth: {}, secret: 'a-secret' }), { db: undefined as never })).rejects.toThrow("Sign-in needs the app's public URL")
  })
})
