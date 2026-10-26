import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { servedShell } from './served-shell'

describe('servedShell', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-own-shell-'))
    await writeFile(path.join(dir, 'protobase.shell.json'), JSON.stringify({ protobase: '0.12.5', pluginApi: 1, paths: ['/index.html', '/assets'] }))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it("serves the server's own shell when it has one, else the bundle's copy", async () => {
    expect(await servedShell(dir)).toEqual({ shell: { dir, paths: ['/index.html', '/assets'] }, note: `the app of Protobase 0.12.5 from ${dir}` })
    expect(await servedShell(undefined)).toEqual({ note: "the bundle's copy of the app" })
  })

  it('refuses a folder that holds no shell', async () => {
    await expect(servedShell(tmpdir())).rejects.toThrow(`${tmpdir()} holds no shell: it has no protobase.shell.json`)
  })
})
