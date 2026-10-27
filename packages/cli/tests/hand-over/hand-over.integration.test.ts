import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../../src/version/version'
import { writePackage } from '../support/packages'

const cli = path.resolve(__dirname, '../../bin/protobase-source.mjs')

// The CLI started in a project that has a stand-in @protobase/cli installed, which prints what it was asked to run.
describe("the hand-over to a locked project's CLI", () => {
  let projectDir = ''
  beforeEach(async () => {
    projectDir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-hand-over-')))
    await writePackage(projectDir, { name: '@protobase/cli', version: '0.9.0', type: 'module' }, { 'dist/index.js': "export const run = async (argv) => console.log('project CLI', argv.slice(2).join(' '))\n" })
  })
  afterEach(() => rm(projectDir, { recursive: true, force: true }))

  const manifest = (field: string) => writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'app', [field]: { '@protobase/cli': '0.9.0', '@protobase/server': '0.9.0' } }))
  const start = (...args: string[]) => spawnSync('node', [cli, ...args], { cwd: projectDir, encoding: 'utf8' })

  it('runs a locked project with the CLI it installed, naming it on stderr', async () => {
    await manifest('dependencies')
    expect(start('build', '--out', 'dist')).toMatchObject({
      status: 0,
      stdout: 'project CLI build --out dist\n',
      stderr: 'protobase: this project is locked; running its own @protobase/cli 0.9.0\n',
    })
  })

  it('runs a bundled project itself, whatever CLI it installed', async () => {
    await manifest('devDependencies')
    expect(start('--version')).toMatchObject({ status: 0, stdout: `${protobaseVersion}\n`, stderr: '' })
  })
})
