import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const cli = path.resolve(__dirname, '../../bin/protobase-source.mjs')

const script = [
  "import { resource } from '@protobase/schema'",
  "import { defineConfig } from '@protobase/config'",
  "import { configExports } from '@protobase/server/config-exports'",
  "import { Kysely } from 'kysely'",
  'console.log([resource, defineConfig, configExports, Kysely].map((value) => typeof value).join(), process.argv.slice(2).join(" "))',
  '',
].join('\n')

// `protobase run` in a project with nothing installed, started as a process as a package.json script starts it.
describe('protobase run', () => {
  let projectDir = ''
  beforeEach(async () => {
    projectDir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-run-')))
    await writeFile(path.join(projectDir, 'script.ts'), script)
  })
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  const manifest = (field: string) => writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module', [field]: { '@protobase/server': '*' } }))
  const run = (...args: string[]) => spawnSync('node', [cli, 'run', ...args], { cwd: projectDir, encoding: 'utf8' })

  it("gives a bundled project's script the CLI's packages, with its own arguments, options too", async () => {
    await manifest('devDependencies')
    expect(run('script.ts', '--seed', '42', 'extra')).toMatchObject({ status: 0, stdout: 'function,function,function,function --seed 42 extra\n' })
  })

  it("passes the script's exit code on", async () => {
    await writeFile(path.join(projectDir, 'fail.ts'), 'process.exit(3)\n')
    expect(run('fail.ts').status).toBe(3)
  })

  it("leaves a locked project's script to its installed packages, never installing one", async () => {
    await manifest('dependencies')
    const result = run('script.ts')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Cannot find module '@protobase/schema'")
  })
})
