import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import semver from 'semver'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../../src/version/version'
import { writePackage } from '../support/packages'

const cli = path.resolve(__dirname, '../../bin/protobase-source.mjs')
const nextMinor = semver.inc(protobaseVersion, 'minor')!
const nextMajor = semver.inc(protobaseVersion, 'major')!

// `doctor` without a database fails at once, after the startup check: its error shows which of the two stopped it.
const doctor = (cwd: string) => spawnSync('bun', [cli, 'doctor'], { cwd, env: { PATH: process.env.PATH }, encoding: 'utf8' })

describe('the startup check', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-project-version-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("runs a command in a project whose caret range holds the CLI's version", async () => {
    for (const version of [protobaseVersion, `${semver.major(protobaseVersion)}.${semver.minor(protobaseVersion)}.0`]) {
      await writePackage(dir, { name: '@protobase/cli', version })
      const result = doctor(dir)
      expect(result.stderr).not.toContain('This project is on Protobase')
      expect(result.stderr).toContain('DATABASE_URL')
    }
  })

  it('refuses a project of a newer minor or major before the command runs, naming both versions', async () => {
    for (const other of [nextMinor, nextMajor]) {
      await writePackage(dir, { name: '@protobase/cli', version: other })
      const result = doctor(dir)
      expect(result.status).toBe(1)
      expect(result.stderr).toBe(`error: This project is on Protobase ${other}, and this CLI is Protobase ${protobaseVersion}: run it with a Protobase ^${other} CLI\n`)
    }
  })

  it('leaves --version and --help to run anywhere', async () => {
    await writePackage(dir, { name: '@protobase/cli', version: nextMajor })
    expect(spawnSync('bun', [cli, '--version'], { cwd: dir, encoding: 'utf8' }).stdout).toBe(`${protobaseVersion}\n`)
    expect(spawnSync('bun', [cli, 'doctor', '--help'], { cwd: dir, encoding: 'utf8' }).status).toBe(0)
  })
})
