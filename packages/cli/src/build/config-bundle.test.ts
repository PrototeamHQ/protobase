import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pdfText } from '../../../../test-support/pdf-text'
import { prebuildifyFiles, writePackage } from '../../tests/support/packages'
import { projectResources } from '../config/project-parts'
import { loadBundle } from '../serve/load-bundle'
import { buildConfigBundle } from './config-bundle'

// Each test bundles with esbuild, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const root = path.resolve(__dirname, '../../../..')

// Inside tests/apps/erp, so the bundle's @protobase imports resolve when the test imports it.
const createProject = async (files: Record<string, string>) => {
  const projectDir = path.join(root, 'tests/apps/erp', `.build-test-${randomBytes(4).toString('hex')}`)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
    await writeFile(path.join(projectDir, file), content)
  }
  return projectDir
}

const things = `import { f, resource } from '@protobase/schema'
export const things = resource('things').table('things').fields({ id: f.integer() }).primaryKey((r) => r.id)
`
const thingsUi = `import { view } from '@protobase/schema'
export const thingsView = view('things').names({ singular: 'Thing', plural: 'Things' })
export const archivedThings = view('things').names({ singular: 'Archived thing', plural: 'Archived things' })
`

// A project whose resources module imports what the test bundles.
const probe = (code: string) => ({ 'config/index.ts': "export * from '../probe'\n", 'probe.ts': code })

// The resources module of a bundle, as the serve runtime loads it.
const bundledResources = async (outFile: string) => projectResources(await loadBundle(outFile))

describe('buildConfigBundle', () => {
  let projectDir = ''
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  it('writes one module that imports @protobase/schema and carries the convention config', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { things } from './things/data'\nexport { thingsView } from './things/ui'\n`,
      'config/things/data.ts': things,
      'config/things/ui.ts': thingsUi,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })

    const code = await readFile(outFile, 'utf8')
    expect(code).not.toContain('// @bun')
    expect(code).toContain('from "@protobase/schema"')
    expect(code).not.toContain('function resource(')
    expect(Object.keys(await bundledResources(outFile)).sort()).toEqual(['things', 'things:archivedThings', 'thingsView'])
  })

  it("keeps config/index.ts's export order, which picks the table the app opens on", async () => {
    const table = (name: string) => `import { f, resource } from '@protobase/schema'
export const ${name} = resource('${name}').table('${name}').fields({ id: f.integer() }).primaryKey((r) => r.id)
`
    projectDir = await createProject({
      'config/index.ts': `export { vehicles } from './vehicles'\nexport * from './jobs'\nexport { customers } from './customers'\n`,
      'config/vehicles.ts': table('vehicles'),
      'config/jobs.ts': `${table('serviceJobs')}${table('appointments').replace(/^import.*\n/, '')}`,
      'config/customers.ts': table('customers'),
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })

    expect(Object.keys(await bundledResources(outFile))).toEqual(['vehicles', 'serviceJobs', 'appointments', 'customers'])
  })

  const nonAscii = {
    'config/index.ts': `export { things } from './things/data'\nexport { thingsView } from './things/ui'\n`,
    'config/things/data.ts': things,
    'config/things/ui.ts': `import { view } from '@protobase/schema'
export const thingsView = view('things').names({ singular: 'Thing 😀', plural: 'Things' }).fields((r) => ({ id: r.id.prefix('€') }))
`,
  }

  // The view as Bun reads the bundle itself; inside Vitest, Vite reads it.
  const thingsViewUnderBun = (outFile: string) => {
    const script = `const { own } = await import(${JSON.stringify(pathToFileURL(outFile).href)}); console.log(JSON.stringify((await own.files.resources()).thingsView))`
    return spawnSync('bun', ['-e', script], { cwd: projectDir, encoding: 'utf8' })
  }

  it('is plain UTF-8 with no `// @bun` pragma, so Bun reads its non-ASCII text back unchanged', async () => {
    projectDir = await createProject(nonAscii)
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })

    const code = await readFile(outFile, 'utf8')
    expect(code).not.toContain('// @bun')
    expect(code).toContain('€')
    const loaded = thingsViewUnderBun(outFile)
    expect(loaded.stderr).toBe('')
    expect(loaded.stdout).toContain('"prefix":"€"')
    expect(loaded.stdout).toContain('"singular":"Thing 😀"')
  })

  it("with bun, is written by Bun's bundler, so Bun reads its non-ASCII text back unchanged", async () => {
    projectDir = await createProject(nonAscii)
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile, bun: true })

    // Bun's pragma, and Bun's escapes: a `// @bun` file is read as Latin-1, so raw UTF-8 would not survive.
    const bytes = await readFile(outFile)
    expect(bytes.toString('latin1').startsWith('// @bun\n')).toBe(true)
    expect(bytes.every((byte) => byte < 0x80)).toBe(true)
    const loaded = thingsViewUnderBun(outFile)
    expect(loaded.stderr).toBe('')
    expect(loaded.stdout).toContain('"prefix":"€"')
    expect(loaded.stdout).toContain('"singular":"Thing 😀"')
  })

  it('keeps what protobase.config.ts describes, read again where the bundle serves, and the code its conventions find', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import { timeout } from './settings'\nexport default () => ({ statementTimeoutMs: timeout, jobs: { nightly: { schedule: '0 3 * * *' } } })\n`,
      'settings.ts': 'export const timeout = 5000\n',
      'config/index.ts': things,
      'jobs/nightly.ts': 'export default async () => {}\n',
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const config = await loadBundle(outFile)
    expect(Object.keys(await projectResources(config))).toEqual(['things'])
    expect(config.statementTimeoutMs).toBe(5000)
    expect(await config.jobs.nightly!.files.module('jobs/nightly.ts')!()).toHaveProperty('default')
  })

  it('takes a JSON config as it takes TypeScript', async () => {
    projectDir = await createProject({ 'protobase.config.json': '{ "statementTimeoutMs": 4000 }', 'config/index.ts': things })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    expect((await loadBundle(outFile)).statementTimeoutMs).toBe(4000)
  })

  it('refuses a config that loads a part of itself later, before it bundles', async () => {
    projectDir = await createProject({ 'protobase.config.ts': `export default { jobs: () => import('./jobs') }\n`, 'config/index.ts': things })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow('imports "./jobs" lazily')
  })

  it('compiles layout files through @protobase/layout/jsx-runtime, which the serve runtime supplies', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { things } from './things/data'\nexport { overview } from './overview/page'\n`,
      'config/things/data.ts': things,
      'config/overview/page.tsx': `/** @jsxImportSource @protobase/layout */\nimport { Page, Table, page } from '@protobase/layout'\nexport const overview = page('overview', <Page title="Overview"><Table resource="things" limit={5} /></Page>)\n`,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const code = await readFile(outFile, 'utf8')
    expect(code).toContain('from "@protobase/layout/jsx-runtime"')
    expect(code).toContain('from "@protobase/layout"')
    expect(((await bundledResources(outFile)).overview as { toModel: () => { tree: unknown } }).toModel().tree).toEqual({ type: 'Page', props: { title: 'Overview' }, children: [{ type: 'Table', props: { resource: 'things', limit: 5 }, children: [] }] })
  })

  it('refuses a layout with values that cannot be static, before anything runs', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { overview } from './overview/page'\n`,
      'config/overview/page.tsx': `/** @jsxImportSource @protobase/layout */\nimport { Page, Table, page } from '@protobase/layout'\nexport const overview = page('overview', <Page title="Overview"><Table resource="things" onRowClick={() => 1} /></Page>)\n`,
    })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(/page\.tsx:3:\d+: <Table onRowClick> is a function; layout props must be static data/)
  })

  it('refuses @protobase packages the serve runtime does not provide', async () => {
    projectDir = await createProject({
      ...probe(`import { DataGrid } from '@protobase/ui'\nexport { DataGrid }\n`),
    })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(
      '@protobase/ui is not available to a served config; of the @protobase packages and their dependencies it may import @protobase/config, @protobase/schema, @protobase/layout, @protobase/layout/jsx-runtime, @protobase/query, @protobase/server, @protobase/server/pdf, @protobase/server/email, kysely,',
    )
  })

  it("leaves the @protobase packages' dependencies to the serve runtime", async () => {
    projectDir = await createProject({
      ...probe(
        [
          `import pg from 'pg'`,
          `import postgres from 'postgres'`,
          `import { jsonArrayFrom } from 'kysely/helpers/postgres'`,
          `import { z } from 'zod'`,
          `export { things } from './resources'`,
          `export const found = [typeof pg.Pool, typeof postgres, typeof jsonArrayFrom, typeof z.object]`,
        ].join('\n'),
      ),
      'resources.ts': things,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    expect((await buildConfigBundle({ projectDir, outFile })).native).toEqual([])

    const code = await readFile(outFile, 'utf8')
    for (const id of ['pg', 'postgres', 'kysely/helpers/postgres', 'zod']) expect(code).toContain(`from "${id}"`)
    expect(code).not.toContain('node_modules')
    expect((await bundledResources(outFile)).found).toEqual(['function', 'function', 'function', 'function'])
  })

  it('leaves the Hono middleware an API function may use to the serve runtime', async () => {
    projectDir = await createProject({
      ...probe(`import { cors } from 'hono/cors'\nimport { HTTPException } from 'hono/http-exception'\nimport { validator } from 'hono/validator'\nexport const found = [cors, HTTPException, validator]\n`),
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const code = await readFile(outFile, 'utf8')
    for (const id of ['hono/cors', 'hono/http-exception', 'hono/validator']) expect(code).toContain(`from "${id}"`)
  })

  const welcomeEmail = (components: string, body: string) =>
    [
      `import { defineEmail } from '@protobase/server'`,
      `import { ${components} } from 'react-email'`,
      `export const welcome = defineEmail({ name: 'welcome', subject: 'Welcome', component: ({ url }: { url: string }) => ${body} })`,
    ].join('\n')

  it("leaves React to the serve runtime, so an email's component renders with the runtime's React Email renderer", async () => {
    projectDir = await createProject({
      ...probe(`export { welcome } from './welcome'\n`),
      'welcome.tsx': welcomeEmail('Button, Html, Text', '<Html><Text>Hi</Text><Button href={url}>Open</Button></Html>'),
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const code = await readFile(outFile, 'utf8')
    for (const id of ['react', 'react/jsx-runtime']) expect(code).toContain(`from "${id}"`)
    expect(code).not.toContain('tailwindcss')
    const { welcome } = (await bundledResources(outFile)) as { welcome: { render: (data: { url: string }) => Promise<{ html: string; text: string }> } }
    const email = await welcome.render({ url: 'https://app.example.com' })
    expect(email.html).toContain('href="https://app.example.com"')
    expect(email.text).toBe('Hi\n\nOpen https://app.example.com')
  })

  it("leaves React PDF's components to the serve runtime, so a document renders with the server's React PDF renderer", async () => {
    projectDir = await createProject({
      ...probe(`export { receipt } from './receipt'\n`),
      'receipt.tsx': [
        `import { definePdf } from '@protobase/server'`,
        `import { Document, Page, Text } from '@protobase/server/pdf'`,
        `export const receipt = definePdf({ name: 'receipt', component: ({ number }: { number: string }) => <Document><Page><Text>Receipt {number}</Text></Page></Document> })`,
      ].join('\n'),
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const code = await readFile(outFile, 'utf8')
    expect(code).toContain('from "@protobase/server/pdf"')
    expect(code).not.toContain('@react-pdf')
    const { receipt } = (await bundledResources(outFile)) as { receipt: { render: (data: { number: string }) => Promise<Uint8Array> } }
    expect(pdfText(await receipt.render({ number: 'R-7' }))).toBe('Receipt R-7')
  })

  it("refuses React PDF's own package, whose renderer the server loads only to render a document", async () => {
    projectDir = await createProject({ ...probe(`import { Text } from '@react-pdf/renderer'\nexport const found = Text\n`) })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow('@react-pdf/renderer is not available to a served config')
  })

  it("refuses React Email's Tailwind component, whose tailwindcss the runtime does not supply", async () => {
    projectDir = await createProject({
      ...probe(`export { welcome } from './welcome'\n`),
      'welcome.tsx': welcomeEmail('Html, Tailwind, Text', '<Tailwind><Html><Text className="p-4">{url}</Text></Html></Tailwind>'),
    })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow('tailwindcss is not available to a served config')
  })

  it('refuses dependencies of the @protobase packages that the runtime does not supply', async () => {
    for (const [id, name] of [
      ['better-auth/plugins', 'admin'],
      ['@tanstack/react-query', 'QueryClient'],
    ]) {
      projectDir = await createProject(probe(`import { ${name} } from '${id}'\nexport { ${name} }\n`))
      await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(`${id} is not available to a served config`)
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('leaves a host package as an import for the runtime to supply, whatever version the project has installed', async () => {
    projectDir = await createProject(probe(`import { z } from 'zod'\nexport { z }\n`))
    await writePackage(projectDir, { name: 'zod', version: '3.25.0' })
    const outFile = path.join(projectDir, 'dist/out.js')
    await buildConfigBundle({ projectDir, outFile })
    expect(await readFile(outFile, 'utf8')).toContain('from "zod"')
  })

  it('leaves a package with a native add-on as an import, also from an inlined package, and reports it', async () => {
    projectDir = await createProject({
      ...probe(`import { hash } from 'native-hash'\nimport { greet } from 'plain-lib'\nexport { hash, greet }\n`),
    })
    const native = await writePackage(projectDir, { name: 'native-hash' }, prebuildifyFiles)
    await writePackage(projectDir, { name: 'plain-lib', type: 'module' }, {
      'index.js': `import { hash } from 'native-hash'\nexport const greet = () => 'hello from plain-lib ' + typeof hash\n`,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    expect((await buildConfigBundle({ projectDir, outFile })).native).toEqual([{ name: 'native-hash', dir: await realpath(native) }])

    const code = await readFile(outFile, 'utf8')
    expect(code).toContain('from "native-hash"')
    expect(code).not.toContain('from "plain-lib"')
    expect(code).toContain('hello from plain-lib')
  })
})
