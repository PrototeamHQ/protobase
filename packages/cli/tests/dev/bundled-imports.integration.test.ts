import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { uiEntry, uiPackageDir } from '../../src/project/admin-app'
import { bundledImports } from '../../src/project/bundled-imports'

// Where a bundled project's page code gets the packages it shares with the admin app, through the plugin the dev
// server of `protobase dev` adds for it: a project with stand-in copies of its own, which must not be used.
describe("a bundled project's page imports", () => {
  let dir: string
  let projectDir: string
  let vite: ViteDevServer | undefined

  const installStandIn = async (name: string) => {
    const packageDir = path.join(projectDir, 'node_modules', name)
    await mkdir(packageDir, { recursive: true })
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name, type: 'module', exports: { '.': './index.js' } }))
    await writeFile(path.join(packageDir, 'index.js'), 'export const copy = "project"\n')
  }

  const resolve = async (id: string, importer: string) => {
    vite ??= await createServer({ root: dir, configFile: false, logLevel: 'silent', server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [bundledImports([projectDir])] })
    return (await vite.pluginContainer.resolveId(id, importer))?.id
  }

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-bundled-imports-')))
    projectDir = path.join(dir, 'app')
    await mkdir(projectDir, { recursive: true })
    for (const name of ['@protobase/ui', '@protobase/layout', 'react']) await installStandIn(name)
  })

  afterEach(async () => {
    await vite?.close()
    vite = undefined
    await rm(dir, { recursive: true, force: true })
  })

  it("are the admin app's own copies, from the CLI, for the project's files", async () => {
    const ui = path.join(projectDir, 'protobase.ui.tsx')
    expect(await resolve('@protobase/ui', ui)).toBe(uiEntry)
    expect(await resolve('react', ui)).toBe(await realpath(createRequire(path.join(uiPackageDir, 'package.json')).resolve('react')))
    expect(await resolve('@protobase/layout', ui)).toMatch(/\/layout\/(src|dist)\/index\.(ts|js)$/)
  })

  it('leave the imports of files outside the project, and of other packages, to Vite', async () => {
    const outside = path.join(dir, 'other.ts')
    expect(await resolve('react', outside)).toBeUndefined()
    expect(await resolve('lucide-react', path.join(projectDir, 'protobase.ui.tsx'))).toBeUndefined()
  })
})
