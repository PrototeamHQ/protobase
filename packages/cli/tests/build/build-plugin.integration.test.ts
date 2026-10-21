import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPlugin } from '../../src/build/plugin-build'
import { expectDebugIdMap } from '../support/source-maps'

const root = path.resolve(__dirname, '../../../..')
const uiVersion = JSON.parse(await readFile(path.join(root, 'packages/ui/package.json'), 'utf8')).version as string

// Inside examples/erp, so the plugin's @protobase/ui and react resolve.
const createPlugin = async (files: Record<string, string>) => {
  const pluginDir = path.join(root, 'examples/erp', `.plugin-test-${randomBytes(4).toString('hex')}`)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(pluginDir, file)), { recursive: true })
    await writeFile(path.join(pluginDir, file), content)
  }
  return pluginDir
}

const greeting = `import { definePlugin, usePlugin } from '@protobase/ui'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Hand } from './hand'

export const Greeting = () => {
  const plugin = usePlugin()
  const [count, setCount] = useState(0)
  return <button className="rounded-md bg-primary px-2 text-sm ring-4 ring-primary/30" onClick={() => setCount(count + 1)}><Hand />{plugin.name} {count}{createPortal(null, document.body)}</button>
}

export default definePlugin({ actions: { wave: () => undefined } })
`

const hand = `export const Hand = () => <span className="text-danger dark:text-warning">hi</span>\n`

// The bare specifiers a module imports, statically or dynamically.
const importsOf = (code: string) => [...code.matchAll(/(?:from|import)\s*\(?\s*"([^"./][^"]*)"/g)].map(([, name]) => name)

// The UI build takes seconds, more on a busy machine.
const buildTimeout = 120_000

describe('buildPlugin', () => {
  let pluginDir = ''
  afterEach(() => rm(pluginDir, { recursive: true, force: true }))

  it('writes one ES module importing only the shared modules by name, its stylesheet, and plugin.json naming them', async () => {
    pluginDir = await createPlugin({ 'package.json': JSON.stringify({ name: 'hello', version: '1.2.0' }), 'protobase.ui.tsx': greeting, 'hand.tsx': hand })
    const outDir = path.join(pluginDir, 'dist')
    const manifest = await buildPlugin({ pluginDir, outDir })

    expect(manifest).toEqual({ name: 'hello', version: '1.2.0', api: 1, protobase: `>=${uiVersion}`, entry: expect.stringMatching(/^assets\/index-[\w-]+\.js$/), css: expect.stringMatching(/^assets\/styles-[\w-]+\.css$/) })
    expect(JSON.parse(await readFile(path.join(outDir, 'plugin.json'), 'utf8'))).toEqual(manifest)
    expect((await readdir(path.join(outDir, 'assets'))).sort()).toEqual([path.basename(manifest.entry), path.basename(manifest.css)].sort())

    const code = await readFile(path.join(outDir, manifest.entry), 'utf8')
    expect([...new Set(importsOf(code))].sort()).toEqual(['@protobase/ui', 'react', 'react-dom', 'react/jsx-runtime'])
    expect(code).toMatch(/export\s*\{[^}]*\bas Greeting\b[^}]*\bas default\b/)
    expect(code).not.toContain('jsxDEV')

    const css = await readFile(path.join(outDir, manifest.css), 'utf8')
    expect(css).toContain('.bg-primary{background-color:var(--primary)}')
    expect(css).toContain('.text-danger{color:var(--danger)}')
    // dark: follows the theme picked in the app, which sets data-theme, rather than only the system's
    expect(css).toMatch(/\.dark\\:text-warning:where\(\[data-theme=dark\],\s*\[data-theme=dark\] \*\)/)
    expect(css).not.toContain('prefers-color-scheme')
    expect(css).toMatch(/\.text-sm\{font-size:var\(--text-sm,\s*\.875rem\)/)
    // Under the app's utilities, which the app's own elements keep (see layerPluginUtilities)
    expect(css).toMatch(/@layer utilities\{\s*@layer plugin\{/)
    // Utilities only: neither the reset nor any theme value, which are the app's
    expect(css).not.toContain('box-sizing:border-box')
    expect(css).not.toMatch(/:root|--color-primary:/)
  }, buildTimeout)

  it('with source maps, ends its module with a debug id and writes the map, carrying it, beside it', async () => {
    pluginDir = await createPlugin({ 'protobase.ui.tsx': greeting, 'hand.tsx': hand })
    const outDir = path.join(pluginDir, 'dist')
    const manifest = await buildPlugin({ pluginDir, outDir, sourceMaps: true })
    await expectDebugIdMap(path.join(outDir, manifest.entry))
  }, buildTimeout)

  it('names the field types it registers in plugin.json, each with the storage types it shows', async () => {
    const fields = `import { definePlugin, type FieldWidgetProps } from '@protobase/ui'
import { stars } from './stars'
const Stars = ({ value }: FieldWidgetProps<number>) => <span>{stars(value ?? 0)}</span>
export default definePlugin({ fields: { rating: { of: ['integer', 'decimal'], display: Stars }, slug: { of: ['text'], display: Stars } } })
`
    pluginDir = await createPlugin({ 'protobase.ui.tsx': fields, 'stars.ts': `export const stars = (count: number) => '★'.repeat(count)\n` })
    const manifest = await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })
    expect(manifest.fields).toEqual({ rating: ['integer', 'decimal'], slug: ['text'] })
    expect(JSON.parse(await readFile(path.join(pluginDir, 'dist/plugin.json'), 'utf8')).fields).toEqual(manifest.fields)
  }, buildTimeout)

  it("builds a project's own UI with @protobase/ui installed inside the project, as npm installs it", async () => {
    // The project's @protobase/ui sits in its node_modules, a folder of its own that re-exports the workspace's, with
    // React beside it.
    const ui = path.join(root, 'packages/ui/src')
    const fields = `import { useState } from 'react'
import { definePlugin, type FieldWidgetProps } from '@protobase/ui'
const Stars = ({ value }: FieldWidgetProps<number>) => <span>{useState('★'.repeat(value ?? 0))[0]}</span>
export default definePlugin({ fields: { rating: { of: ['integer'], display: Stars } } })
`
    pluginDir = await createPlugin({
      'protobase.ui.tsx': fields,
      'node_modules/@protobase/ui/package.json': JSON.stringify({ name: '@protobase/ui', version: uiVersion, type: 'module', protobase: { pluginApi: 1 }, exports: { '.': './index.js', './theme.css': './theme.css' } }),
      'node_modules/@protobase/ui/index.js': `export * from ${JSON.stringify(path.join(ui, 'index.ts'))}\n`,
      'node_modules/@protobase/ui/theme.css': await readFile(path.join(ui, 'theme.css'), 'utf8'),
    })
    for (const name of ['react', 'react-dom']) await symlink(path.join(root, 'packages/ui/node_modules', name), path.join(pluginDir, 'node_modules', name))
    const manifest = await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist'), name: 'app', projectDir: pluginDir })
    expect(manifest.fields).toEqual({ rating: ['integer'] })
  }, buildTimeout)

  it('is named after its folder without a package.json, or by the name given', async () => {
    pluginDir = await createPlugin({ 'protobase.ui.tsx': `export const Board = () => null\n` })
    expect((await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).name).toBe(path.basename(pluginDir))
    expect((await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist'), name: 'board' })).name).toBe('board')
  }, buildTimeout)

  it('takes the Protobase versions engines.protobase names, when they hold the @protobase/ui it is built with', async () => {
    pluginDir = await createPlugin({ 'package.json': JSON.stringify({ name: 'wide', engines: { protobase: '>=0.1.0 <9.0.0' } }), 'protobase.ui.tsx': `export const Board = () => null\n` })
    expect((await buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).protobase).toBe('>=0.1.0 <9.0.0')
    await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({ name: 'wide', engines: { protobase: '>=99.0.0' } }))
    await expect(buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).rejects.toThrow(`engines.protobase ">=99.0.0" leaves out @protobase/ui ${uiVersion}, which the plugin is built with`)
    await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({ name: 'wide', engines: { protobase: '^0.11.0' } }))
    await expect(buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).rejects.toThrow('engines.protobase "^0.11.0" is not a range the app reads')
  }, buildTimeout)

  it('refuses a module of a shared package that is not shared, which would be a second copy', async () => {
    pluginDir = await createPlugin({ 'protobase.ui.tsx': `import { createRoot } from 'react-dom/client'\nexport const Board = () => { createRoot(document.body); return null }\n` })
    await expect(buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).rejects.toThrow('react-dom/client is not shared with plugins')
  }, buildTimeout)

  it('needs a protobase.ui.tsx, and an output folder that does not hold the plugin', async () => {
    pluginDir = await createPlugin({ 'package.json': '{}' })
    await expect(buildPlugin({ pluginDir, outDir: path.join(pluginDir, 'dist') })).rejects.toThrow('There is no protobase.ui.tsx in')
    await writeFile(path.join(pluginDir, 'protobase.ui.tsx'), 'export const Board = () => null\n')
    await expect(buildPlugin({ pluginDir, outDir: pluginDir })).rejects.toThrow("holds the plugin's own files")
    await expect(buildPlugin({ pluginDir, outDir: path.dirname(pluginDir) })).rejects.toThrow("holds the plugin's own files")
  })
})
