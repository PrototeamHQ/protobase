import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiVite } from '../../src/dev/api-vite'
import { serverPackage } from '../../src/dev/server-package'

// Which @protobase/server the API process of `protobase dev` loads, through the Vite server it loads the API with: a
// stand-in package that names its copy, installed for a stand-in CLI and, in some cases, for the project.
describe("the API process's @protobase/server", () => {
  let dir: string
  let cliDir: string
  let projectDir: string
  let vite: ViteDevServer | undefined

  const installServer = async (at: string, copy: string) => {
    const packageDir = path.join(at, 'node_modules/@protobase/server')
    await mkdir(packageDir, { recursive: true })
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@protobase/server', type: 'module', exports: { '.': './index.js' } }))
    await writeFile(path.join(packageDir, 'index.js'), `export const copy = ${JSON.stringify(copy)}\n`)
  }

  const manifest = (dependencies: Record<string, string>) => writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module', dependencies }))

  // The copy the project's config gets, and the one the CLI's own code (as entry.ts) gets.
  const loaded = async () => {
    vite = await createApiVite({ projectDir, extensions: [], cacheDir: path.join(dir, 'cache') }, serverPackage(projectDir, cliDir))
    const config = await vite.ssrLoadModule(path.join(projectDir, 'protobase.config.ts'))
    const cli = await vite.ssrLoadModule(path.join(cliDir, 'src/entry.ts'))
    return { config: config.default as string, cli: cli.copy as string }
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-dev-server-'))
    cliDir = path.join(dir, 'cli')
    projectDir = path.join(dir, 'app')
    await installServer(cliDir, 'cli')
    await mkdir(path.join(cliDir, 'src'), { recursive: true })
    await writeFile(path.join(cliDir, 'src/entry.ts'), "export { copy } from '@protobase/server'\n")
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, 'protobase.config.ts'), "import { copy } from '@protobase/server'\nexport default copy\n")
  })

  afterEach(async () => {
    await vite?.close()
    vite = undefined
    await rm(dir, { recursive: true, force: true })
  })

  it("is the CLI's for a project without a package.json", async () => {
    expect(await loaded()).toEqual({ config: 'cli', cli: 'cli' })
  })

  it("is the CLI's for a package.json that does not list it, even with a copy in the project's node_modules", async () => {
    await manifest({ react: '^19.0.0' })
    await installServer(projectDir, 'project')
    expect(await loaded()).toEqual({ config: 'cli', cli: 'cli' })
  })

  it("is the project's when its package.json lists it and it is installed, for the CLI's code too", async () => {
    await manifest({ '@protobase/server': '^0.14.0' })
    await installServer(projectDir, 'project')
    expect(await loaded()).toEqual({ config: 'project', cli: 'project' })
  })

  it('fails as any missing package does when the package.json lists it and it is not installed', async () => {
    await manifest({ '@protobase/server': '^0.14.0' })
    await expect(loaded()).rejects.toThrow(/@protobase\/server/)
  })
})
