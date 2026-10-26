import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../../src/version/version'
import { writePackage } from '../support/packages'

const cli = path.resolve(__dirname, '../../bin/protobase-source.mjs')
const [major, minor] = protobaseVersion.split('.').map(Number)

// `doctor` without a database fails at once, after the startup check: its error shows which of the two stopped it.
const doctor = (cwd: string) => spawnSync('bun', [cli, 'doctor'], { cwd, env: { PATH: process.env.PATH }, encoding: 'utf8' })

describe('the startup check', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-project-major-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("runs a command in a project of the CLI's major, older or newer minor", async () => {
    for (const version of [`${major}.${minor! + 1}.0`, `${major}.0.0`]) {
      await writePackage(dir, { name: '@protobase/cli', version })
      const result = doctor(dir)
      expect(result.stderr).not.toContain('This project is on Protobase')
      expect(result.stderr).toContain('DATABASE_URL')
    }
  })

  it('refuses a project of another major before the command runs, naming both versions', async () => {
    const other = `${major! + 1}.0.0`
    await writePackage(dir, { name: '@protobase/cli', version: other })
    const result = doctor(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(`error: This project is on Protobase ${other}, and this CLI is Protobase ${protobaseVersion}: run it with a Protobase ${major! + 1}.x CLI\n`)
  })

  it('leaves --version and --help to run anywhere', async () => {
    await writePackage(dir, { name: '@protobase/cli', version: `${major! + 1}.0.0` })
    expect(spawnSync('bun', [cli, '--version'], { cwd: dir, encoding: 'utf8' }).stdout).toBe(`${protobaseVersion}\n`)
    expect(spawnSync('bun', [cli, 'doctor', '--help'], { cwd: dir, encoding: 'utf8' }).status).toBe(0)
  })
})
