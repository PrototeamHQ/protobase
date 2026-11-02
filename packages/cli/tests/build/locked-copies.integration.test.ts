import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import semver from 'semver'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../../src/version/version'

const cli = path.resolve(__dirname, '../../bin/protobase-source.mjs')
// The oldest version of the CLI's minor, which the CLI runs a project locked to.
const older = `${semver.major(protobaseVersion)}.${semver.minor(protobaseVersion)}.0`

const config = ["import { defineConfig } from '@protobase/config'", "import { resource } from '@protobase/schema'", '', "export default defineConfig({ resources: { notes: resource('notes', {}) } })", ''].join('\n')

// A project locked to an older version, whose installed copies of the @protobase packages fail when they load.
describe('protobase build of a locked project', () => {
  let projectDir = ''
  beforeEach(async () => {
    projectDir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-locked-copies-')))
    const names = ['config', 'schema', 'server']
    await writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module', dependencies: Object.fromEntries(names.map((name) => [`@protobase/${name}`, `^${older}`])) }))
    await writeFile(path.join(projectDir, 'protobase.config.ts'), config)
    for (const name of names) {
      const dir = path.join(projectDir, 'node_modules/@protobase', name)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: `@protobase/${name}`, version: older, type: 'module', exports: { '.': './index.js' } }))
      await writeFile(path.join(dir, 'index.js'), `throw new Error("loaded the project's own @protobase/${name}")\n`)
    }
  })
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  for (const runtime of ['bun', 'node']) {
    it(`reads the config with the CLI's own copies under ${runtime}, loading none of the project's`, () => {
      const result = spawnSync(runtime, [cli, 'build', '--out', 'dist'], { cwd: projectDir, encoding: 'utf8' })
      expect(result.stderr).not.toContain("loaded the project's own")
      expect(result.status).toBe(0)
    }, 60_000)
  }
})
