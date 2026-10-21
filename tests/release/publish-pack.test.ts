import { spawnSync } from 'node:child_process'
import { appendFile, chmod, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = path.resolve(__dirname, '../..')

// Stands in for Bun: `bun run build` does nothing, and `bun pm pack` fails when the package.json of another package is
// not as the test found it. `bun pm pack` reads every workspace's package.json, so one rewritten or restored for
// another pack meanwhile can be read half-written, which failed the 0.13.1 and 0.13.2 releases.
const fakeBun = `#!${process.execPath}
const { readFileSync } = require('node:fs')
const path = require('node:path')
if (process.argv[2] === 'pm') {
  const own = path.join(process.cwd(), 'package.json')
  for (const [file, content] of Object.entries(JSON.parse(readFileSync(process.env.MANIFESTS, 'utf8')))) {
    if (file !== own && readFileSync(file, 'utf8') !== content) {
      console.error(file + ' changed while ' + own + ' was packed')
      process.exit(1)
    }
  }
}
`

const readManifests = async (repo: string) => {
  const dirs = await readdir(path.join(repo, 'packages'))
  const files = dirs.map((dir) => path.join(repo, 'packages', dir, 'package.json'))
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const)))
}

// Each package's package.json, all the fake Bun reads, in a repository of its own: the script rewrites them while it
// packs, and this repository's own are what the tests running beside this one resolve the packages through.
const copyManifests = async (repo: string) => {
  for (const dir of await readdir(path.join(root, 'packages'))) {
    await mkdir(path.join(repo, 'packages', dir), { recursive: true })
    await copyFile(path.join(root, 'packages', dir, 'package.json'), path.join(repo, 'packages', dir, 'package.json'))
  }
}

describe('scripts/publish.mjs --pack', () => {
  let binDir = ''
  let repo = ''
  afterEach(() => Promise.all([binDir, repo].map((dir) => rm(dir, { recursive: true, force: true }))))

  it('packs every public package while the others keep their package.json, and restores each one', async () => {
    binDir = await mkdtemp(path.join(tmpdir(), 'protobase-fake-bun-'))
    await writeFile(path.join(binDir, 'bun'), fakeBun)
    await chmod(path.join(binDir, 'bun'), 0o755)
    // Real, as the fake Bun's working directory is: macOS's temporary folder is behind a symlink.
    repo = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-pack-')))
    await copyManifests(repo)
    const manifests = await readManifests(repo)
    await writeFile(path.join(binDir, 'manifests.json'), JSON.stringify(manifests))

    const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, MANIFESTS: path.join(binDir, 'manifests.json') }
    const packed = spawnSync(process.execPath, [path.join(root, 'scripts/publish.mjs'), '--pack'], { cwd: repo, env, encoding: 'utf8' })

    expect(packed.stderr).toBe('')
    expect(packed.status).toBe(0)
    const publicPackages = Object.values(manifests).filter((content) => !JSON.parse(content).private)
    expect(packed.stdout.match(/^packed /gm)).toHaveLength(publicPackages.length)
    expect(await readManifests(repo)).toEqual(manifests)
  })
})

// Stands in for npm: `npm view` finds no version, and `npm publish` of a tarball fails with the error code of
// IDENTITY_TOKEN_READ_ERROR the first time, as GitHub's OIDC endpoint now and then fails npm's provenance, which failed
// the 0.38.0 release, or always with FAILURE when set. Each publish is logged to PUBLISHES.
const fakeNpm = `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs')
if (process.argv[2] === 'view') process.exit(1)
const tarball = process.argv[3]
const before = readFileSync(process.env.PUBLISHES, 'utf8').split('\\n').filter((line) => line === tarball).length
appendFileSync(process.env.PUBLISHES, tarball + '\\n')
if (process.env.FAILURE) {
  console.error('npm error code ' + process.env.FAILURE)
  process.exit(1)
}
if (before === 0) {
  console.error('npm error code IDENTITY_TOKEN_READ_ERROR')
  process.exit(1)
}
`

describe('scripts/publish.mjs', () => {
  // Each publish tried again waits a second first.
  vi.setConfig({ testTimeout: 30_000 })

  let binDir = ''
  let repo = ''
  afterEach(() => Promise.all([binDir, repo].map((dir) => rm(dir, { recursive: true, force: true }))))

  const publish = async (failure?: string) => {
    binDir = await mkdtemp(path.join(tmpdir(), 'protobase-fake-npm-'))
    for (const [name, script] of Object.entries({ bun: '#!/bin/sh\n', npm: fakeNpm })) {
      await writeFile(path.join(binDir, name), script)
      await chmod(path.join(binDir, name), 0o755)
    }
    const publishes = path.join(binDir, 'publishes')
    await appendFile(publishes, '')
    repo = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-publish-')))
    await copyManifests(repo)
    const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, PUBLISHES: publishes, FAILURE: failure ?? '' }
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/publish.mjs')], { cwd: repo, env, encoding: 'utf8' })
    const lines = (await readFile(publishes, 'utf8')).split('\n').filter(Boolean)
    return { result, lines }
  }

  it('publishes a tarball again when npm could not read the identity token', async () => {
    const { result, lines } = await publish()

    expect(result.status).toBe(0)
    const published = result.stdout.match(/^published /gm) ?? []
    expect(published.length).toBeGreaterThan(0)
    expect(lines).toHaveLength(published.length * 2)
  })

  it('fails at once on any other npm error', async () => {
    const { result, lines } = await publish('E403')

    expect(result.status).toBe(1)
    expect(result.stdout).not.toMatch(/^published /m)
    expect(new Set(lines).size).toBe(lines.length)
  })
})
