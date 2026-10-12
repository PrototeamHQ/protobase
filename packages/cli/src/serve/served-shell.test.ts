import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BundleLayout } from '../bundle/manifest'
import { servedShell } from './served-shell'

const plugin = { name: 'app', path: 'plugins/app/plugin.json', api: 1, protobase: '>=0.12.2' }
const bundle = (plugins: BundleLayout['plugins']): BundleLayout => ({
  version: 3,
  server: 'protobase.config.js',
  public: 'public',
  spa: 'index.html',
  api: ['/api'],
  plugins,
  shell: { protobase: '0.12.2', pluginApi: 1, paths: ['/index.html', '/assets'] },
})

describe('servedShell', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-own-shell-'))
    await writeFile(path.join(dir, 'protobase.shell.json'), JSON.stringify({ protobase: '0.12.5', pluginApi: 1, paths: ['/index.html', '/assets'] }))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it("serves the server's own shell when every plugin of the bundle loads in it", async () => {
    expect(await servedShell(bundle([plugin]), dir)).toEqual({ shell: { dir, paths: ['/index.html', '/assets'] }, note: `the app of Protobase 0.12.5 from ${dir}` })
  })

  it("serves the bundle's copy when a plugin would be off in the server's shell, or the server has none", async () => {
    expect(await servedShell(bundle([plugin, { ...plugin, name: 'crm', protobase: '>=0.12.7' }]), dir)).toEqual({
      note: "the bundle's copy of the app: its plugin crm would be off in the app of Protobase 0.12.5, since it needs Protobase >=0.12.7, and this app runs 0.12.5",
    })
    expect(await servedShell(bundle([{ ...plugin, api: 2 }]), dir)).toMatchObject({ note: expect.stringContaining('it is built for plugin API 2') })
    expect(await servedShell(bundle([plugin]), undefined)).toEqual({ note: "the bundle's copy of the app" })
  })

  it('refuses a folder that holds no shell', async () => {
    await expect(servedShell(bundle([]), tmpdir())).rejects.toThrow(`${tmpdir()} holds no shell: it has no protobase.shell.json`)
  })
})
