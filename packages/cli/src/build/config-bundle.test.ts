import { randomBytes } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { prebuildifyFiles, writePackage } from '../../tests/support/packages'
import { buildConfigBundle } from './config-bundle'

const root = path.resolve(__dirname, '../../../..')

// Inside examples/erp, so the bundle's @protobase imports resolve when the test imports it.
const createProject = async (files: Record<string, string>) => {
  const projectDir = path.join(root, 'examples/erp', `.build-test-${randomBytes(4).toString('hex')}`)
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

describe('buildConfigBundle', () => {
  let projectDir = ''
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  it('writes one module that imports @protobase/schema and default-exports the convention config', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { things } from './things/data'\nexport { thingsView } from './things/ui'\n`,
      'config/things/data.ts': things,
      'config/things/ui.ts': thingsUi,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })

    const code = await readFile(outFile, 'utf8')
    expect(code.startsWith('// @bun\n')).toBe(true)
    expect(code).toContain('from "@protobase/schema"')
    expect(code).not.toContain('function resource(')
    const { default: project } = await import(pathToFileURL(outFile).href)
    expect(Object.keys(project.config).sort()).toEqual(['things', 'things:archivedThings', 'thingsView'])
  })

  it('keeps what protobase.config.ts exports', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import * as config from './resources'\nexport default { config, options: { statementTimeoutMs: 5000 } }\n`,
      'resources.ts': things,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const { default: project } = await import(pathToFileURL(outFile).href)
    expect(Object.keys(project.config)).toEqual(['things'])
    expect(project.options).toEqual({ statementTimeoutMs: 5000 })
  })

  it('compiles layout files through @protobase/layout/jsx-runtime, which the serve runtime supplies', async () => {
    projectDir = await createProject({
      'config/index.ts': `export { things } from './things/data'\nexport { overview } from './overview/page'\n`,
      'config/things/data.ts': things,
      'config/overview/page.tsx': `/** @jsxImportSource @protobase/layout */\nimport { Page, Table, page } from '@protobase/layout'\nexport const overview = page('overview', <Page title="Overview"><Table resource="things" pageSize={5} /></Page>)\n`,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    await buildConfigBundle({ projectDir, outFile })
    const code = await readFile(outFile, 'utf8')
    expect(code).toContain('from "@protobase/layout/jsx-runtime"')
    expect(code).toContain('from "@protobase/layout"')
    const { default: project } = await import(pathToFileURL(outFile).href)
    expect(project.config.overview.toModel().tree).toEqual({ type: 'Page', props: { title: 'Overview' }, children: [{ type: 'Table', props: { resource: 'things', pageSize: 5 }, children: [] }] })
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
      'protobase.config.ts': `import { DataGrid } from '@protobase/ui'\nexport default { config: { DataGrid } }\n`,
    })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(
      '@protobase/ui is not available to a served config; of the @protobase packages and their dependencies it may import @protobase/schema, @protobase/layout, @protobase/layout/jsx-runtime, @protobase/query, @protobase/server, kysely,',
    )
  })

  it("leaves the @protobase packages' dependencies to the serve runtime", async () => {
    projectDir = await createProject({
      'protobase.config.ts': [
        `import pg from 'pg'`,
        `import postgres from 'postgres'`,
        `import { jsonArrayFrom } from 'kysely/helpers/postgres'`,
        `import { z } from 'zod'`,
        `import * as config from './resources'`,
        `export default { config, options: { found: [typeof pg.Pool, typeof postgres, typeof jsonArrayFrom, typeof z.object] } }`,
      ].join('\n'),
      'resources.ts': things,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    expect(await buildConfigBundle({ projectDir, outFile })).toEqual([])

    const code = await readFile(outFile, 'utf8')
    for (const id of ['pg', 'postgres', 'kysely/helpers/postgres', 'zod']) expect(code).toContain(`from "${id}"`)
    expect(code).not.toContain('node_modules')
    const { default: project } = await import(pathToFileURL(outFile).href)
    expect(project.options.found).toEqual(['function', 'function', 'function', 'function'])
  })

  it('refuses dependencies of the @protobase packages that the runtime does not supply', async () => {
    for (const [id, name] of [
      ['better-auth/plugins', 'admin'],
      ['react', 'useState'],
    ]) {
      projectDir = await createProject({ 'protobase.config.ts': `import { ${name} } from '${id}'\nexport default { config: { ${name} } }\n` })
      await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(`${id} is not available to a served config`)
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  it('refuses a version of a host package that the runtime would replace', async () => {
    projectDir = await createProject({ 'protobase.config.ts': `import { z } from 'zod'\nexport default { config: { z } }\n` })
    await writePackage(projectDir, { name: 'zod', version: '3.25.0' })
    await expect(buildConfigBundle({ projectDir, outFile: path.join(projectDir, 'dist/out.js') })).rejects.toThrow(
      'zod 3.25.0 is installed here, but the serve runtime supplies zod 4.',
    )
  })

  it('leaves a package with a native add-on as an import, also from an inlined package, and reports it', async () => {
    projectDir = await createProject({
      'protobase.config.ts': `import { hash } from 'native-hash'\nimport { greet } from 'plain-lib'\nexport default { config: {}, options: { hash, greet } }\n`,
    })
    const native = await writePackage(projectDir, { name: 'native-hash' }, prebuildifyFiles)
    await writePackage(projectDir, { name: 'plain-lib', type: 'module' }, {
      'index.js': `import { hash } from 'native-hash'\nexport const greet = () => 'hello from plain-lib ' + typeof hash\n`,
    })
    const outFile = path.join(projectDir, 'dist/protobase.config.js')
    expect(await buildConfigBundle({ projectDir, outFile })).toEqual([{ name: 'native-hash', dir: await realpath(native) }])

    const code = await readFile(outFile, 'utf8')
    expect(code).toContain('from "native-hash"')
    expect(code).not.toContain('from "plain-lib"')
    expect(code).toContain('hello from plain-lib')
  })
})
