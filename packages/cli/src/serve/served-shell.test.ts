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

  it('names the native packages the shell runs on when its protobase.shell.json names them', async () => {
    const native = { '@capacitor/core': '8.5.3', '@protobase/mobile': 'native-1' }
    const named = await mkdtemp(path.join(tmpdir(), 'protobase-own-shell-'))
    await writeFile(path.join(named, 'protobase.shell.json'), JSON.stringify({ protobase: '0.15.0', pluginApi: 1, paths: ['/index.html'], native }))
    expect((await servedShell(named)).native).toEqual(native)
    await rm(named, { recursive: true, force: true })
  })

  it('refuses a folder that holds no shell', async () => {
    await expect(servedShell(tmpdir())).rejects.toThrow(`${tmpdir()} holds no shell: it has no protobase.shell.json`)
  })
})
