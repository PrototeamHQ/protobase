import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prebuildifyFiles, writePackage } from '../support/packages'
import { protobaseVersion } from '../../src/version/version'
import { buildDeployBundle } from '../../src/build/deploy-bundle'
import { testPng } from '../support/png'

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

  it('writes the config module, the production app (the shell) and a manifest of the API paths, versions and shell', async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    const manifest = await buildDeployBundle({ projectDir, outDir })

    const shell = { protobase: protobaseVersion, pluginApi: 1, paths: ['/index.html', '/assets', '/protobase.sw.js'] }
    const expected = { version: 3, protobase: protobaseVersion, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'], plugins: [], theme: 'protobase.theme.css', shell, icons: { favicon: false, png: [] } }
    expect(manifest).toEqual(expected)
    expect(JSON.parse(await readFile(path.join(outDir, 'protobase.bundle.json'), 'utf8'))).toEqual(expected)
    expect(await readFile(path.join(outDir, 'protobase.config.js'), 'utf8')).not.toContain('// @bun')

    const index = await readFile(path.join(outDir, 'public/index.html'), 'utf8')
    const assets = await readdir(path.join(outDir, 'public/assets'))
    const script = assets.find((file) => /^index-[\w-]+\.js$/.test(file))
    const style = assets.find((file) => /^index-[\w-]+\.css$/.test(file))
    expect(index).toContain(`src="/assets/${script}"`)
    expect(index).toContain(`href="/assets/${style}"`)
    expect(index).not.toContain('./main')
    const code = await readFile(path.join(outDir, 'public/assets', script!), 'utf8')
    expect(code).not.toContain('@vite/client')
    expect(code).not.toContain('react-refresh')
    expect(code).not.toContain('jsxDEV')

    // The page registers the shell's service worker, which caches the page and what it loads first.
    expect(index).toContain(`'serviceWorker' in navigator && !window.Capacitor) navigator.serviceWorker.register('/protobase.sw.js')`)
    expect(index).toContain('<link rel="manifest" href="/api/manifest.webmanifest"')
    const worker = await readFile(path.join(outDir, 'public/protobase.sw.js'), 'utf8')
    const precache = JSON.parse(/const precache = (.*)/.exec(worker)![1]!) as string[]
    expect(precache).toEqual(expect.arrayContaining(['/index.html', `/assets/${script}`, `/assets/${style}`, '/protobase.theme.css', '/protobase.favicon.svg']))
  }, buildTimeout)

  it('names the modules it shares with plugins in an import map, ahead of every module, each an entry exporting its names', async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir })

    const index = await readFile(path.join(outDir, 'public/index.html'), 'utf8')
    const [, json] = /<script type="importmap">(.*?)<\/script>/.exec(index) ?? []
    const { imports } = JSON.parse(json!) as { imports: Record<string, string> }
    expect(Object.keys(imports)).toEqual(['react', 'react/jsx-runtime', 'react-dom', '@protobase/ui'])
    expect(index.indexOf('type="importmap"')).toBeLessThan(index.indexOf('type="module"'))
    expect(index.indexOf('type="importmap"')).toBeLessThan(index.indexOf('modulepreload'))
    const exported = async (url: string) => {
      const code = await readFile(path.join(outDir, 'public', url), 'utf8')
      return (/export\s*\{([^}]*)\}\s*;?\s*$/.exec(code)?.[1] ?? '').split(',').map((item) => item.trim().split(/\s+as\s+/).at(-1))
    }
    expect(await exported(imports.react!)).toEqual(expect.arrayContaining(['default', 'useState', 'createContext']))
    expect(await exported(imports['react/jsx-runtime']!)).toEqual(expect.arrayContaining(['jsx', 'jsxs', 'Fragment']))
    expect(await exported(imports['react-dom']!)).toEqual(expect.arrayContaining(['createPortal']))
    expect(await exported(imports['@protobase/ui']!)).toEqual(expect.arrayContaining(['useClient', 'useList', 'defineUi']))
  }, buildTimeout)

  it("writes the project's theme checked and minified, which the app links after its own stylesheets, and an empty one without", async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir })
    expect(await readFile(path.join(outDir, 'public/protobase.theme.css'), 'utf8')).toBe('')
    const index = await readFile(path.join(outDir, 'public/index.html'), 'utf8')
    expect(index).toContain('<link rel="stylesheet" href="/protobase.theme.css">')
    expect(index.indexOf('href="/protobase.theme.css"')).toBeGreaterThan(index.lastIndexOf('/assets/index-'))

    await writeFile(path.join(projectDir, 'protobase.theme.css'), ':root {\n  --primary: #0d9488;\n  --radius: 10px;\n  --primry: red;\n}\n[data-theme="dark"] { --primary: #2dd4bf; }\n')
    const warnings: string[] = []
    const manifest = await buildDeployBundle({ projectDir, outDir, onWarning: (message) => warnings.push(message) })
    expect(manifest.theme).toBe('protobase.theme.css')
    expect(await readFile(path.join(outDir, 'public/protobase.theme.css'), 'utf8')).toBe(':root{--primary:#0d9488;--radius:10px;--primry:red}[data-theme=dark]{--primary:#2dd4bf}')
    expect(warnings).toEqual(['protobase.theme.css:1: --primry is not a token the app reads; check its name'])

    await writeFile(path.join(projectDir, 'protobase.theme.css'), '.sidebar { background: red; }\n')
    await expect(buildDeployBundle({ projectDir, outDir })).rejects.toThrow('protobase.theme.css is not a theme:')
  }, buildTimeout)

  it("writes the project's favicon and PNG icons, which the app links, and Protobase's favicon without one", async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir })
    expect(await readFile(path.join(outDir, 'public/protobase.favicon.svg'), 'utf8')).toBe(await readFile(path.join(root, 'packages/ui/src/app/favicon.svg'), 'utf8'))
    expect(await readFile(path.join(outDir, 'public/index.html'), 'utf8')).toContain('<link rel="icon" type="image/svg+xml" href="/protobase.favicon.svg">')

    const own = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>'
    await writeFile(path.join(projectDir, 'protobase.favicon.svg'), own)
    const touchIcon = testPng(180)
    await writeFile(path.join(projectDir, 'protobase.apple-touch-icon.png'), touchIcon)
    const manifest = await buildDeployBundle({ projectDir, outDir })
    expect(await readFile(path.join(outDir, 'public/protobase.favicon.svg'), 'utf8')).toBe(own)
    expect(await readFile(path.join(outDir, 'public/protobase.apple-touch-icon.png'))).toEqual(touchIcon)
    expect(manifest.icons).toEqual({ favicon: true, png: ['appleTouch'] })
    expect(await readFile(path.join(outDir, 'public/index.html'), 'utf8')).toContain('<link rel="apple-touch-icon" href="/protobase.apple-touch-icon.png">')
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

  it("with bun, has Bun's bundler write the config module", async () => {
    projectDir = await createProject({ 'config/index.ts': things })
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir, bun: true })
    expect((await readFile(path.join(outDir, 'protobase.config.js'), 'utf8')).startsWith('// @bun\n')).toBe(true)
  }, buildTimeout)

  it('never runs protobase.config.ts: one that throws on import still builds', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import * as config from './resources'\nthrow new Error('protobase.config.ts ran at build time')\nexport default { config }\n`,
      'resources.ts': things,
    })
    const manifest = await buildDeployBundle({ projectDir, outDir: path.join(projectDir, 'dist') })
    expect(manifest.api).toEqual(['/api'])
  }, buildTimeout)

  // property-finder's listings offered a district filter on a field that was not filterable, which the API refused.
  it('fails on a view that filters by a field its resource does not mark filterable, before it builds the app', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { things } from './things/data'\n`,
      'config/things/data.ts': `import { f, resource } from '@protobase/schema'\nexport const things = resource('things').table('things').fields({ id: f.integer(), district: f.text() }).primaryKey((r) => r.id)\n`,
      'config/things/ui.ts': `import { view } from '@protobase/schema'\nimport type { things } from './data'\nexport const thingsView = view<typeof things>('things').filters((r, w) => [w.facets(r.district)])\n`,
    })
    const outDir = path.join(projectDir, 'dist')
    await expect(buildDeployBundle({ projectDir, outDir })).rejects.toThrow(
      'View "things": the facets filter uses "district", which is not filterable, so the API refuses it: mark "district" .filterable()',
    )
    expect(existsSync(path.join(outDir, 'public'))).toBe(false)
  }, buildTimeout)

  it('builds protobase.ui.tsx as the plugin app, its components exported by name, and fails on a declared one it lacks', async () => {
    const declared = `import { component } from '@protobase/layout'\n${things}export const RepairBoard = component<{ by: string }>('RepairBoard')\nexport const PlanCard = component('PlanCard')\n`
    projectDir = await createProject({
      'config/index.ts': declared,
      'ui/repair-board.tsx': `export const RepairBoard = ({ by }: { by: string }) => <p>Board by {by} 7c1d</p>\n`,
      'protobase.ui.tsx': `import { defineUi } from '@protobase/ui'\nexport { RepairBoard } from './ui/repair-board'\nexport default defineUi({ components: { PlanCard: () => <p>Plan</p> } })\n`,
    })
    const outDir = path.join(projectDir, 'dist')
    const manifest = await buildDeployBundle({ projectDir, outDir })
    expect(manifest.plugins).toEqual([{ name: 'app', path: 'plugins/app/plugin.json', api: 1, protobase: `>=${protobaseVersion}` }])
    const plugin = JSON.parse(await readFile(path.join(outDir, 'public/plugins/app/plugin.json'), 'utf8')) as { entry: string; css: string }
    const code = await readFile(path.join(outDir, 'public/plugins/app', plugin.entry), 'utf8')
    expect(code).toContain('Board by')
    expect(code).toMatch(/export\s*\{[^}]*RepairBoard/)

    await writeFile(path.join(projectDir, 'protobase.ui.tsx'), `export { RepairBoard } from './ui/repair-board'\n`)
    await expect(buildDeployBundle({ projectDir, outDir })).rejects.toThrow(
      "The config declares component('PlanCard'), but protobase.ui.tsx exports no component by that name. Export each from its own file and re-export it, such as: export { PlanCard } from './ui/PlanCard'",
    )
  }, buildTimeout)
})
