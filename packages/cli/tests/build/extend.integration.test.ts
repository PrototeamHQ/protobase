import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildDeployBundle } from '../../src/build/deploy-bundle'
import { resolveExtensions } from '../../src/project/extensions'

const root = path.resolve(__dirname, '../../../..')

const write = async (dir: string, files: Record<string, string>) => {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await writeFile(path.join(dir, file), content)
  }
  return dir
}

// Inside examples/erp, so the project's @protobase imports resolve.
const createProject = (files: Record<string, string>) => write(path.join(root, 'examples/erp', `.extend-test-${randomBytes(4).toString('hex')}`), files)

// Outside the repository, with no node_modules: its @protobase and React imports can only resolve from the project.
const createExtension = async (files: Record<string, string>) => write(await mkdtemp(path.join(tmpdir(), 'protobase-extension-')), files)

const things = `import { f, resource } from '@protobase/schema'
export const things = resource('things').table('things').fields({ id: f.integer() }).primaryKey((r) => r.id)
`

const tool = (name: string) => `defineTool({ name: '${name}', description: 'Shows the card.', parameters: { type: 'object' }, run: async (_args, { show }) => {
  show(widget('ProtobaseTestCard', {}))
  return 'shown'
} })`

const extensionFiles = {
  'protobase.config.ts': `import { defineConfig, defineTool, widget } from '@protobase/server'
export default defineConfig({ name: 'test-extension', options: { assistant: { tools: [${tool('protobase_test_show')}] } } })
`,
  'protobase.ui.tsx': `import { ActionCard, defineUi } from '@protobase/ui'
const ProtobaseTestCard = () => <div className="rotate-[17deg]"><ActionCard title="Extension card c4f1e2" /></div>
export default defineUi({ name: 'test-extension', components: { ProtobaseTestCard } })
`,
}

const projectUi = (component: string) => `import { defineUi } from '@protobase/ui'
const ${component} = () => <p>Own component</p>
export default defineUi({ components: { ${component} } })
`

// The UI build takes seconds, more on a busy machine.
const buildTimeout = 120_000

describe('protobase build --extend', () => {
  let projectDir = ''
  let extensionDir = ''
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
    await rm(extensionDir, { recursive: true, force: true })
  })

  it("merges the extension's tool into the served config and its component into the UI", async () => {
    projectDir = await createProject({ 'config/index.ts': things, 'protobase.ui.tsx': projectUi('OwnCard') })
    extensionDir = await createExtension(extensionFiles)
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir, extensions: resolveExtensions([extensionDir]) })

    const { default: served } = await import(pathToFileURL(path.join(outDir, 'protobase.config.js')).href)
    expect(Object.keys(served.config)).toEqual(['things'])
    expect(served.options.assistant.tools.map((entry: { name: string }) => entry.name)).toEqual(['protobase_test_show'])

    const assets = await readdir(path.join(outDir, 'public/assets'))
    const code = await readFile(path.join(outDir, 'public/assets', assets.find((file) => /^index-[\w-]+\.js$/.test(file))!), 'utf8')
    for (const text of ['ProtobaseTestCard', 'Extension card c4f1e2', 'OwnCard', 'test-extension']) expect(code).toContain(text)
    // Tailwind writes the classes only the extension uses too.
    const style = await readFile(path.join(outDir, 'public/assets', assets.find((file) => /^index-[\w-]+\.css$/.test(file))!), 'utf8')
    expect(style).toContain('rotate-\\[17deg\\]')
  }, buildTimeout)

  it('fails the build when the project defines a component the extension defines, naming both', async () => {
    projectDir = await createProject({ 'config/index.ts': things, 'protobase.ui.tsx': projectUi('ProtobaseTestCard') })
    extensionDir = await createExtension(extensionFiles)
    await expect(buildDeployBundle({ projectDir, outDir: path.join(projectDir, 'dist'), extensions: resolveExtensions([extensionDir]) })).rejects.toThrow(
      'The component "ProtobaseTestCard" is defined twice, by test-extension and by protobase.ui.tsx; rename one of them',
    )
  }, buildTimeout)

  it('fails to load a served config whose tool the extension defines too, naming both', async () => {
    projectDir = await createProject({
      'config/index.ts': things,
      'protobase.config.ts': `import { defineTool, widget } from '@protobase/server'\nimport * as config from './config'\nexport default { config, options: { assistant: { tools: [${tool('protobase_test_show')}] } } }\n`,
    })
    extensionDir = await createExtension({ 'protobase.config.ts': extensionFiles['protobase.config.ts'] })
    const outDir = path.join(projectDir, 'dist')
    await buildDeployBundle({ projectDir, outDir, extensions: resolveExtensions([extensionDir]) })
    await expect(import(pathToFileURL(path.join(outDir, 'protobase.config.js')).href)).rejects.toThrow(
      'The assistant tool "protobase_test_show" is defined twice, by test-extension and by protobase.config.ts; rename one of them',
    )
  }, buildTimeout)

  it('refuses a folder with neither config', async () => {
    extensionDir = await createExtension({ 'README.md': 'nothing here' })
    expect(() => resolveExtensions([extensionDir])).toThrow(`--extend ${extensionDir}: ${await realpath(extensionDir)} has neither protobase.config.ts nor protobase.ui.tsx`)
    expect(() => resolveExtensions([path.join(extensionDir, 'missing')])).toThrow(`there is no folder ${path.join(extensionDir, 'missing')}`)
  })
})
