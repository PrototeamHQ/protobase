import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeProjectTypes } from '../../src/project/project-types'

const tsc = path.resolve(__dirname, '../../../../node_modules/typescript/bin/tsc')

// A project with nothing installed whose tsconfig.json extends the generated one, type-checked by TypeScript.
describe('.protobase/tsconfig.json', () => {
  let projectDir = ''
  beforeEach(async () => {
    projectDir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-types-')))
  })
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  const write = async (files: Record<string, string>) => {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
      await writeFile(path.join(projectDir, file), content)
    }
  }

  const typecheck = () => spawnSync('node', [tsc, '-p', projectDir], { encoding: 'utf8' })

  const tsconfig = JSON.stringify({
    extends: './.protobase/tsconfig.json',
    compilerOptions: { target: 'ES2023', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, types: [] },
  })

  const data = [
    "import type { Kysely } from 'kysely'",
    "import { defineConfig } from '@protobase/config'",
    "import { f, resource } from '@protobase/schema'",
    "export const things = resource('things').table('things').fields({ id: f.integer() }).primaryKey((r) => r.id)",
    'export type Db = Kysely<{ things: { id: number } }>',
    "export default defineConfig({ name: 'Shop' })",
    '',
  ].join('\n')

  it("types a bundled project's @protobase and runtime-supplied imports from the CLI, and real mistakes still fail", async () => {
    await write({ 'package.json': JSON.stringify({ name: 'app', devDependencies: { '@protobase/server': '*' } }), 'tsconfig.json': tsconfig, 'data.ts': data })
    await writeProjectTypes(projectDir)
    const generated = JSON.parse(await readFile(path.join(projectDir, '.protobase/tsconfig.json'), 'utf8'))
    expect(Object.keys(generated.compilerOptions.paths)).toEqual(expect.arrayContaining(['@protobase/server', '@protobase/layout/jsx-runtime', 'kysely', 'zod']))
    expect(generated.compilerOptions.paths).not.toHaveProperty('*')
    expect(generated.compilerOptions.paths).not.toHaveProperty('react')
    expect(await readFile(path.join(projectDir, '.protobase/.gitignore'), 'utf8')).toBe('*\n')
    expect(typecheck()).toMatchObject({ status: 0, stdout: '' })

    await writeFile(path.join(projectDir, 'data.ts'), `${data}export const wrong: string = defineConfig({ name: 'Shop' })\n`)
    expect(typecheck().stdout).toContain("data.ts(7,14): error TS2322: Type 'WithJobs<{}>' is not assignable to type 'string'.")

    await writeFile(path.join(projectDir, 'data.ts'), `${data}import 'left-pad'\n`)
    expect(typecheck().stdout).toContain("Cannot find module or type declarations for side-effect import of 'left-pad'")
  }, 60_000)

  it("holds no paths in a locked project, whose installed packages type themselves", async () => {
    await write({ 'package.json': JSON.stringify({ name: 'app', dependencies: { '@protobase/server': '*' } }) })
    await writeProjectTypes(projectDir)
    expect(JSON.parse(await readFile(path.join(projectDir, '.protobase/tsconfig.json'), 'utf8'))).toEqual({ compilerOptions: {} })
  })
})
