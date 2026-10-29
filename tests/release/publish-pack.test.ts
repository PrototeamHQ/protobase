import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
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

  it('lists every tarball with its package and version in --out', async () => {
    binDir = await mkdtemp(path.join(tmpdir(), 'protobase-fake-bun-'))
    await writeFile(path.join(binDir, 'bun'), '#!/bin/sh\n')
    await chmod(path.join(binDir, 'bun'), 0o755)
    repo = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-pack-')))
    await copyManifests(repo)

    const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` }
    const packed = spawnSync(process.execPath, [path.join(root, 'scripts/publish.mjs'), '--pack', '--out', 'out'], { cwd: repo, env, encoding: 'utf8' })

    expect(packed.status).toBe(0)
    const listed = JSON.parse(await readFile(path.join(repo, 'out', 'packages.json'), 'utf8'))
    expect(listed).toContainEqual({ name: schema.name, version: schema.version, tarball: `protobase-schema-${schema.version}.tgz` })
    expect(listed).toHaveLength(publicPackageCount())
    expect(packed.stdout).toContain(`packed ${path.join(repo, 'out', `protobase-schema-${schema.version}.tgz`)}\n`)
  })
})

// Stands in for npm: `npm view` finds only the name@version in ON_NPM, and `npm publish` of a tarball fails with the
// error code FIRST_FAILURE the first time, as GitHub's OIDC endpoint now and then fails npm's provenance with
// IDENTITY_TOKEN_READ_ERROR, which failed the 0.38.0 release, and the transparency log with TLOG_CREATE_ENTRY_ERROR,
// which failed the 0.62.2 release, or always with FAILURE when set, for every tarball or only those whose
// path holds FAILING. Each publish logs its start and its end to PUBLISHES; with WAIT_FOR set, it ends only once that
// many tarballs have started, or after 5 seconds, so publishes one after another show as an end before the last start.
const fakeNpm = `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs')
if (process.argv[2] === 'view') {
  if (process.argv[3] !== process.env.ON_NPM) process.exit(1)
  console.log(process.argv[3].split('@').pop())
  process.exit(0)
}
const tarball = process.argv[3]
const before = readFileSync(process.env.PUBLISHES, 'utf8').split('\\n').filter((line) => line === 'start ' + tarball).length
appendFileSync(process.env.PUBLISHES, 'start ' + tarball + '\\n')
const started = () => new Set(readFileSync(process.env.PUBLISHES, 'utf8').split('\\n').filter((line) => line.startsWith('start '))).size
const waitUntil = Date.now() + 5_000
const finish = () => {
  if (started() < Number(process.env.WAIT_FOR) && Date.now() < waitUntil) return setTimeout(finish, 20)
  appendFileSync(process.env.PUBLISHES, 'end ' + tarball + '\\n')
  if (process.env.FAILURE && tarball.includes(process.env.FAILING)) {
    console.error('npm error code ' + process.env.FAILURE)
    process.exit(1)
  }
  if (before === 0) {
    console.error('npm error code ' + process.env.FIRST_FAILURE)
    process.exit(1)
  }
}
finish()
`

const readManifest = (dir: string) => JSON.parse(readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8'))
const publicPackageCount = () => readdirSync(path.join(root, 'packages')).filter((dir) => !readManifest(dir).private).length
const schema = readManifest('schema')

// What npm printed when the transparency log refused its own retry of an entry, in the 0.62.2 release.
const tlogConflict = 'TLOG_CREATE_ENTRY_ERROR\nnpm error error creating tlog entry - (409) an equivalent entry already exists in the transparency log'

describe('scripts/publish.mjs', () => {
  // Each publish tried again waits a second first.
  vi.setConfig({ testTimeout: 30_000 })

  let binDir = ''
  let repo = ''
  afterEach(() => Promise.all([binDir, repo].map((dir) => rm(dir, { recursive: true, force: true }))))

  const publish = async ({ firstFailure = 'IDENTITY_TOKEN_READ_ERROR', failure = '', failing = '', onNpm = '', waitFor = '', args = [] as string[] } = {}) => {
    binDir = await mkdtemp(path.join(tmpdir(), 'protobase-fake-npm-'))
    for (const [name, script] of Object.entries({ bun: '#!/bin/sh\n', npm: fakeNpm })) {
      await writeFile(path.join(binDir, name), script)
      await chmod(path.join(binDir, name), 0o755)
    }
    const publishes = path.join(binDir, 'publishes')
    await appendFile(publishes, '')
    repo = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-publish-')))
    await copyManifests(repo)
    const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, PUBLISHES: publishes, FIRST_FAILURE: firstFailure, FAILURE: failure, FAILING: failing, ON_NPM: onNpm, WAIT_FOR: waitFor }
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/publish.mjs'), ...args], { cwd: repo, env, encoding: 'utf8' })
    const log = (await readFile(publishes, 'utf8')).split('\n').filter(Boolean)
    const lines = log.filter((line) => line.startsWith('start ')).map((line) => line.slice('start '.length))
    return { result, log, lines }
  }

  it('publishes a tarball again when npm could not read the identity token', async () => {
    const { result, lines } = await publish()

    expect(result.status).toBe(0)
    const published = result.stdout.match(/^published /gm) ?? []
    expect(published.length).toBeGreaterThan(0)
    expect(lines).toHaveLength(published.length * 2)
  })

  it('publishes a tarball again when the transparency log already had its entry', async () => {
    const { result, lines } = await publish({ firstFailure: tlogConflict })

    expect(result.status).toBe(0)
    const published = result.stdout.match(/^published /gm) ?? []
    expect(published.length).toBeGreaterThan(0)
    expect(lines).toHaveLength(published.length * 2)
  })

  it('fails at once on any other npm error', async () => {
    const { result, lines } = await publish({ failure: 'E403' })

    expect(result.status).toBe(1)
    expect(result.stdout).not.toMatch(/^published /m)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('starts every upload before any of them finishes', async () => {
    const { result, log } = await publish({ waitFor: String(publicPackageCount()) })

    expect(result.status).toBe(0)
    const firstEnd = log.findIndex((line) => line.startsWith('end '))
    expect(new Set(log.slice(0, firstEnd)).size).toBe(publicPackageCount())
  })

  it('skips a version npm already has', async () => {
    const { result, lines } = await publish({ onNpm: `${schema.name}@${schema.version}` })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`${schema.name}@${schema.version} is already on npm\n`)
    expect(new Set(lines).size).toBe(publicPackageCount() - 1)
    expect(lines.some((line) => line.includes('protobase-schema-'))).toBe(false)
  })

  it('lets the other uploads finish when one fails, then fails naming it', async () => {
    const { result } = await publish({ failure: 'E403', failing: 'protobase-schema-' })

    expect(result.status).toBe(1)
    expect(result.stdout.match(/^published /gm)).toHaveLength(publicPackageCount() - 1)
    expect(result.stdout).not.toMatch(/^published @protobase\/schema@/m)
    expect(result.stderr).toContain(`could not publish ${schema.name}@${schema.version}\n`)
  })

  // The tarballs a pack job listed, here two at 1.2.3 that are never read: the fake npm only logs their paths.
  let packedDir = ''
  afterEach(() => rm(packedDir, { recursive: true, force: true }))
  const packedAt = async (version: string) => {
    packedDir = await mkdtemp(path.join(tmpdir(), 'protobase-packed-'))
    const listed = ['schema', 'cli'].map((dir) => ({ name: `@protobase/${dir}`, version, tarball: `protobase-${dir}-${version}.tgz` }))
    await writeFile(path.join(packedDir, 'packages.json'), JSON.stringify(listed))
    return packedDir
  }

  it('publishes exactly the tarballs --from lists, skipping a version npm already has', async () => {
    const from = await packedAt('1.2.3')
    const { result, lines } = await publish({ onNpm: '@protobase/schema@1.2.3', args: ['--from', from, '--tag', 'v1.2.3'] })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('@protobase/schema@1.2.3 is already on npm\n')
    expect(result.stdout.match(/^published .*$/gm)).toEqual(['published @protobase/cli@1.2.3'])
    expect(new Set(lines)).toEqual(new Set([path.join(from, 'protobase-cli-1.2.3.tgz')]))
  })

  it('publishes nothing when the tag is not the version the tarballs were stamped with', async () => {
    const from = await packedAt('1.2.3')
    const { result, lines } = await publish({ args: ['--from', from, '--tag', 'v1.3.0'] })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('v1.3.0 is not the version of @protobase/schema@1.2.3, @protobase/cli@1.2.3, so nothing is published')
    expect(lines).toEqual([])
  })
})
