import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { packageEntry } from './package-entry'

let projectDir = ''
afterEach(() => rm(projectDir, { recursive: true, force: true }))

const install = async (name: string, manifest: Record<string, unknown>, files: string[]) => {
  projectDir = projectDir || (await realpath(await mkdtemp(path.join(tmpdir(), 'package-entry-'))))
  const dir = path.join(projectDir, 'node_modules', name)
  for (const file of files) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await writeFile(path.join(dir, file), 'export default 1\n')
  }
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }))
  return dir
}

describe('packageEntry', () => {
  it('resolves a package that exports only `import`, as an ES module import does', async () => {
    const dir = await install('@acme/plugin', { type: 'module', exports: { '.': { types: './index.d.ts', import: './dist/index.js' } } }, ['dist/index.js'])
    expect(packageEntry('@acme/plugin', projectDir)).toBe(path.join(dir, 'dist/index.js'))
  })

  it('takes nested conditions and a subpath', async () => {
    const dir = await install('acme', { exports: { '.': './main.js', './steps': { node: { import: './steps.mjs', require: './steps.cjs' } } } }, ['main.js', 'steps.mjs'])
    expect(packageEntry('acme/steps', projectDir)).toBe(path.join(dir, 'steps.mjs'))
  })

  it("prefers `import` over `require` when they are the package's top-level conditions", async () => {
    const dir = await install('dual', { exports: { require: './index.cjs', import: './index.mjs' } }, ['index.cjs', 'index.mjs'])
    expect(packageEntry('dual', projectDir)).toBe(path.join(dir, 'index.mjs'))
  })

  it('falls back to `main`, with the extension Node adds, for a package without `exports`', async () => {
    const dir = await install('old', { main: 'lib/index' }, ['lib/index.js'])
    expect(packageEntry('old', projectDir)).toBe(path.join(dir, 'lib/index.js'))
  })

  it('refuses a subpath the package does not export, and a package that is not installed', async () => {
    await install('closed', { exports: { '.': './index.js' } }, ['index.js'])
    expect(() => packageEntry('closed/inner', projectDir)).toThrow('The package closed exports no ./inner to import')
    expect(() => packageEntry('missing', projectDir)).toThrow('Cannot find the package missing')
  })
})
