import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import semver from 'semver'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../../src/version/version'

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

  const manifest = (specifier: string) => writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', devDependencies: { '@protobase/cli': specifier } }))

  it("runs a command in a project whose specifier holds the CLI's version", async () => {
    for (const specifier of [protobaseVersion, `^${semver.major(protobaseVersion)}.${semver.minor(protobaseVersion)}.0`]) {
      await manifest(specifier)
      const result = doctor(dir)
      expect(result.stderr).not.toContain('This project asks for Protobase')
      expect(result.stderr).toContain('DATABASE_URL')
    }
  })

  it('refuses a project of a newer minor or major before the command runs, naming both versions', async () => {
    for (const other of [`^${nextMinor}`, `^${nextMajor}`]) {
      await manifest(other)
      const result = doctor(dir)
      expect(result.status).toBe(1)
      expect(result.stderr).toBe(`error: This project asks for Protobase ${other}, and this CLI is Protobase ${protobaseVersion}: run it with a CLI whose version ${other} holds\n`)
    }
  })

  it('leaves --version and --help to run anywhere', async () => {
    await manifest(`^${nextMajor}`)
    expect(spawnSync('bun', [cli, '--version'], { cwd: dir, encoding: 'utf8' }).stdout).toBe(`${protobaseVersion}\n`)
    expect(spawnSync('bun', [cli, 'doctor', '--help'], { cwd: dir, encoding: 'utf8' }).status).toBe(0)
  })
})
