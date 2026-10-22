import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { siteFiles } from './site-files'

describe('siteFiles', () => {
  let root: string
  const write = async (file: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), file)
  }
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'protobase-site-files-'))
    for (const file of ['public/index.html', 'public/assets/old-1.js', 'public/plugins/app/plugin.json', 'shell/index.html', 'shell/assets/new-2.js', 'shell/protobase.shell.json']) await write(file)
  })
  afterAll(() => rm(root, { recursive: true, force: true }))

  const hrefs = async (files: Promise<Array<{ href: string; file: string }>>) => (await files).map(({ href, file }) => [href, path.relative(root, file)]).sort()

  it("lists the public folder's files by their path inside it", async () => {
    expect(await hrefs(siteFiles({ publicDir: path.join(root, 'public'), spa: 'index.html' }))).toEqual([
      ['assets/old-1.js', 'public/assets/old-1.js'],
      ['index.html', 'public/index.html'],
      ['plugins/app/plugin.json', 'public/plugins/app/plugin.json'],
    ])
  })

  it("takes the shell's paths from the server's own shell, as the web gets them", async () => {
    const shell = { dir: path.join(root, 'shell'), paths: ['/index.html', '/assets'] }
    expect(await hrefs(siteFiles({ publicDir: path.join(root, 'public'), spa: 'index.html', shell }))).toEqual([
      ['assets/new-2.js', 'shell/assets/new-2.js'],
      ['index.html', 'shell/index.html'],
      ['plugins/app/plugin.json', 'public/plugins/app/plugin.json'],
    ])
  })
})
