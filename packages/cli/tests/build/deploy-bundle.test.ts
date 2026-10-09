import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prebuildifyFiles, writePackage } from '../support/packages'
import { protobaseVersion } from '../../src/version/version'
import { buildDeployBundle } from '../../src/build/deploy-bundle'

const root = path.resolve(__dirname, '../../../..')

// Inside examples/erp, so the project's @protobase imports resolve.
const createProject = async (files: Record<string, string>) => {
  const projectDir = path.join(root, 'examples/erp', `.deploy-test-${randomBytes(4).toString('hex')}`)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
    await writeFile(path.join(projectDir, file), content)
  }
  return projectDir
}

const things = `import { f, resource } from '@protobase/schema'
export const things = resource('things').table('things').fields({ id: f.integer() }).primaryKey((r) => r.id)
`

// The UI build takes seconds, more on a busy machine.
const buildTimeout = 120_000

describe('buildDeployBundle', () => {
  let projectDir = ''
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  it('writes the config module, the production UI and a manifest of the default API paths and the Protobase version', async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    const manifest = await buildDeployBundle({ projectDir, outDir })

    const expected = { version: 2, protobase: protobaseVersion, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'] }
    expect(manifest).toEqual(expected)
    expect(JSON.parse(await readFile(path.join(outDir, 'protobase.bundle.json'), 'utf8'))).toEqual(expected)
    expect((await readFile(path.join(outDir, 'protobase.config.js'), 'utf8')).startsWith('// @bun\n')).toBe(true)

    const index = await readFile(path.join(outDir, 'public/index.html'), 'utf8')
    const assets = await readdir(path.join(outDir, 'public/assets'))
    const script = assets.find((file) => /^index-[\w-]+\.js$/.test(file))
    const style = assets.find((file) => /^index-[\w-]+\.css$/.test(file))
    expect(index).toContain(`src="/assets/${script}"`)
    expect(index).toContain(`href="/assets/${style}"`)
    expect(index).not.toContain('main.tsx')
    const code = await readFile(path.join(outDir, 'public/assets', script!), 'utf8')
    expect(code).not.toContain('@vite/client')
    expect(code).not.toContain('react-refresh')
    expect(code).not.toContain('jsxDEV')
  }, buildTimeout)

  it('carries a native package in node_modules and names it in the manifest, until a build without one', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import { hash } from 'native-hash'\nimport * as config from './resources'\nexport default { config, options: { hash } }\n`,
      'resources.ts': things,
    })
    await writePackage(projectDir, { name: 'native-hash', dependencies: { 'node-gyp-build': '^4' } }, prebuildifyFiles)
    await writePackage(projectDir, { name: 'node-gyp-build' })
    const outDir = path.join(projectDir, 'dist')
    const manifest = await buildDeployBundle({ projectDir, outDir })

    expect(manifest.nodeModules).toBe('node_modules')
    expect(JSON.parse(await readFile(path.join(outDir, 'protobase.bundle.json'), 'utf8')).nodeModules).toBe('node_modules')
    expect((await readdir(path.join(outDir, 'node_modules'))).sort()).toEqual(['native-hash', 'node-gyp-build'])
    expect((await readdir(path.join(outDir, 'node_modules/native-hash/prebuilds'))).sort()).toEqual(['linux-arm64', 'linux-x64'])

    await writeFile(path.join(projectDir, 'protobase.config.ts'), `import * as config from './resources'\nexport default { config }\n`)
    expect((await buildDeployBundle({ projectDir, outDir })).nodeModules).toBeUndefined()
    expect(existsSync(path.join(outDir, 'node_modules'))).toBe(false)
  }, buildTimeout)

  it('never deletes a node_modules folder it did not write', async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    await writePackage(projectDir, { name: 'own-dependency' })
    await expect(buildDeployBundle({ projectDir, outDir: projectDir })).rejects.toThrow(
      `${path.join(projectDir, 'node_modules')} was not written by \`protobase build\`; build into another folder (--out)`,
    )
    expect(existsSync(path.join(projectDir, 'node_modules/own-dependency/package.json'))).toBe(true)
  })

  it('never runs the project: a config that throws on import still builds', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import * as config from './resources'\nthrow new Error('protobase.config.ts ran at build time')\nexport default { config }\n`,
      'resources.ts': things,
    })
    const manifest = await buildDeployBundle({ projectDir, outDir: path.join(projectDir, 'dist') })
    expect(manifest.api).toEqual(['/api'])
  }, buildTimeout)

  it('builds the ERP through the CLI without BETTER_AUTH_SECRET or a database', async () => {
    projectDir = path.join(root, 'examples/erp', `.deploy-test-${randomBytes(4).toString('hex')}`)
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }
    const built = spawnSync('node', [path.join(root, 'packages/cli/bin/protobase.mjs'), 'build', '--out', projectDir], { cwd: path.join(root, 'examples/erp'), env, encoding: 'utf8' })
    expect(built.stderr).toBe('')
    expect(built.status).toBe(0)
    const manifest = JSON.parse(await readFile(path.join(projectDir, 'protobase.bundle.json'), 'utf8'))
    expect(manifest.api).toEqual(['/api'])
    expect(manifest.protobase).toBe(protobaseVersion)
    expect(await readdir(path.join(projectDir, 'public/assets'))).not.toHaveLength(0)
  }, buildTimeout)
})
