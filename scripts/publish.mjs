// Publishes every public packages/* package to npm at the version in its package.json, skipping a version npm already
// has, so a missed or half-done publish can be run again. The packages are built concurrently and packed with Bun
// (which pins the workspace:* dependencies) one at a time, then every tarball is published with npm at once: npm makes
// each new version visible after a lag of its own anyway, so publishing in dependency order would not keep a package
// from being served before the @protobase packages it needs. One failing upload lets the others finish, then fails the
// script naming it, and running it again publishes only what npm is missing. npm authenticates with trusted publishing
// (OIDC) and adds provenance in the release workflow. `--dry-run` runs `npm publish --dry-run`; `--pack` builds and
// packs every package, whatever npm has, and publishes nothing, which CI runs so a package that cannot be packed fails
// before a release is cut. `--pack --out <dir>` packs into that directory and lists the tarballs in its packages.json,
// and `--from <dir> --tag v<x.y.z>` publishes the tarballs that list names, building nothing, after checking that every
// one is at the tag's version: the release workflow packs while its checks run and its publish job only uploads.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { isTlogConflict, nextStep } from './publish/next-step.mjs'

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean' }, pack: { type: 'boolean' }, out: { type: 'string' }, from: { type: 'string' }, tag: { type: 'string' } },
})
const dryRun = values['dry-run'] ?? false
const packOnly = values.pack ?? false
if (values.out && !packOnly) throw new Error('--out packs, so it needs --pack')
if (values.from && (packOnly || !values.tag)) throw new Error('usage: node scripts/publish.mjs --from <dir> --tag v<x.y.z>')
const outDir = values.out ? path.resolve(values.out) : mkdtempSync(path.join(tmpdir(), 'protobase-publish-'))

// Runs a command, resolving with its stdout. Output of concurrent commands is buffered and printed whole on exit, so
// the logs of different packages do not interleave.
const run = (command, args, cwd = '.') =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd })
    let stdout = ''
    let output = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', (status) => {
      if (status === 0) return resolve(stdout)
      process.stderr.write(output)
      reject(Object.assign(new Error(`${command} ${args.join(' ')} in ${cwd} failed with status ${status}`), { output }))
    })
  })

const readPackages = () =>
  readdirSync('packages').flatMap((dir) => {
    const packageDir = path.join('packages', dir)
    const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    if (manifest.private) return []
    return [{ dir: packageDir, name: manifest.name, version: manifest.version, build: Boolean(manifest.scripts?.build) }]
  })

// Whether npm already has name@version.
const isPublished = async ({ name, version }) => {
  const stdout = await run('npm', ['view', `${name}@${version}`, 'version']).catch(() => '')
  return stdout.trim() === version
}

// `bun pm pack` ignores publishConfig, so its manifest fields (exports, types, bin) are applied to
// package.json for the pack only, as pnpm and npm apply them, and the file is restored after.
const pack = async ({ dir, name, version }) => {
  const file = path.join(dir, 'package.json')
  const original = readFileSync(file, 'utf8')
  const manifest = JSON.parse(original)
  const { access, registry, tag, ...fields } = manifest.publishConfig ?? {}
  writeFileSync(file, `${JSON.stringify({ ...manifest, ...fields, publishConfig: { access } }, null, 2)}\n`)
  try {
    await run('bun', ['pm', 'pack', '--ignore-scripts', '--quiet', '--destination', outDir], dir)
  } finally {
    writeFileSync(file, original)
  }
  return path.join(outDir, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`)
}

// The packages whose version npm does not have yet.
const unpublished = async (packages) => {
  const published = await Promise.all(packages.map(isPublished))
  for (const [i, { name, version }] of packages.entries()) {
    if (published[i]) console.log(`${name}@${version} is already on npm`)
  }
  return packages.filter((_, i) => !published[i])
}

// The tarballs `--pack --out` listed, each with its package's name and version, failing before npm is asked anything when
// one is not at the tag's version, as when the release cut another tag than the one its tarballs were stamped with.
const readPacked = (dir, tag) => {
  const packed = JSON.parse(readFileSync(path.join(dir, 'packages.json'), 'utf8'))
  const version = tag.startsWith('v') ? tag.slice(1) : ''
  const other = packed.filter((p) => p.version !== version)
  if (other.length > 0) {
    throw new Error(`${tag} is not the version of ${other.map(({ name, version }) => `${name}@${version}`).join(', ')}, so nothing is published`)
  }
  return packed.map((p) => ({ ...p, tarball: path.join(dir, p.tarball) }))
}

// Builds and packs the packages, one tarball for each.
const buildAndPack = async (pending) => {
  // Every package is built before any package.json is rewritten for packing, since a build resolves its dependencies'
  // sources through their workspace exports, and before any is published, so a failing build publishes nothing. A
  // package without a build script, such as @protobase/mobile, which holds no JavaScript, is packed as it is.
  await Promise.all(pending.filter(({ build }) => build).map(({ dir }) => run('bun', ['run', 'build'], dir)))
  // One pack at a time: `bun pm pack` reads every workspace's package.json to pin the workspace:* dependencies, and one
  // rewritten or restored for another pack meanwhile can be read half-written, failing the pack with `Failed to resolve
  // workspace version`.
  const packed = []
  for (const p of pending) packed.push({ name: p.name, version: p.version, tarball: await pack(p) })
  return packed
}

// Publishes one tarball, trying it again or counting it as published when next-step.mjs says so; it resolves with
// whether this run uploaded it.
const publishTarball = async (p, attempt = 1) => {
  try {
    await run('npm', ['publish', p.tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])])
    return true
  } catch (error) {
    const output = error.output ?? ''
    const published = isTlogConflict(output) && (await isPublished(p))
    const step = nextStep({ output, attempt, published })
    if (step === 'fail') throw error
    if (step === 'published') {
      console.log(`${p.name}@${p.version} is already on npm, so its transparency log entry already existed`)
      return false
    }
    console.log(`npm could not publish ${p.name}@${p.version} (attempt ${attempt}), publishing it again`)
    await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt))
    return publishTarball(p, attempt + 1)
  }
}

const publishAll = async (pending) => {
  const results = await Promise.allSettled(
    pending.map(async (p) => {
      if (await publishTarball(p)) console.log(`${dryRun ? 'would publish' : 'published'} ${p.name}@${p.version}`)
    }),
  )
  const failed = pending.filter((_, i) => results[i].status === 'rejected')
  if (failed.length === 0) return
  console.error(`could not publish ${failed.map(({ name, version }) => `${name}@${version}`).join(', ')}`)
  process.exitCode = 1
}

if (values.from) {
  await publishAll(await unpublished(readPacked(values.from, values.tag)))
} else if (packOnly) {
  mkdirSync(outDir, { recursive: true })
  const packed = await buildAndPack(readPackages())
  const list = packed.map(({ name, version, tarball }) => ({ name, version, tarball: path.basename(tarball) }))
  writeFileSync(path.join(outDir, 'packages.json'), `${JSON.stringify(list, null, 2)}\n`)
  for (const { tarball } of packed) console.log(`packed ${tarball}`)
} else {
  await publishAll(await buildAndPack(await unpublished(readPackages())))
}
