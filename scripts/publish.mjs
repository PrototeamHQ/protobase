// Publishes every public packages/* package to npm at the version in its package.json, skipping a version npm already
// has, so a missed or half-done publish can be run again. The packages are built concurrently and packed with Bun
// (which pins the workspace:* dependencies) one at a time, then the tarballs are published with npm in dependency
// layers, each layer's packages concurrently, so a package is never on npm before the @protobase packages it needs. npm
// authenticates with trusted publishing (OIDC) and adds provenance in the release workflow. `--dry-run` runs
// `npm publish --dry-run`; `--pack` builds and packs every package, whatever npm has, and publishes nothing, which CI
// runs so a package that cannot be packed fails before a release is cut.
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const packOnly = args.includes('--pack')
const outDir = mkdtempSync(path.join(tmpdir(), 'protobase-publish-'))

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
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
    return [{ dir: packageDir, name: manifest.name, version: manifest.version, dependencies, build: Boolean(manifest.scripts?.build) }]
  })

// Groups the packages into layers, each depending only on packages in the layers before it.
const toLayers = (packages) => {
  const names = new Set(packages.map((p) => p.name))
  const placed = new Set()
  const layers = []
  let remaining = packages
  while (remaining.length > 0) {
    const layer = remaining.filter((p) => p.dependencies.every((d) => !names.has(d) || placed.has(d)))
    if (layer.length === 0) throw new Error(`circular @protobase dependencies among ${remaining.map((p) => p.name)}`)
    for (const p of layer) placed.add(p.name)
    layers.push(layer)
    remaining = remaining.filter((p) => !layer.includes(p))
  }
  return layers
}

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

const packages = readPackages()
const pending = packOnly ? packages : await unpublished(packages)

// Every package is built before any package.json is rewritten for packing, since a build resolves its dependencies'
// sources through their workspace exports, and before any is published, so a failing build publishes nothing. A package
// without a build script, such as @protobase/mobile, which only pins dependencies, is packed as it is.
await Promise.all(pending.filter(({ build }) => build).map(({ dir }) => run('bun', ['run', 'build'], dir)))
// One pack at a time: `bun pm pack` reads every workspace's package.json to pin the workspace:* dependencies, and one
// rewritten or restored for another pack meanwhile can be read half-written, failing the pack with `Failed to resolve
// workspace version`.
const tarballOf = new Map()
for (const p of pending) tarballOf.set(p.name, await pack(p))

// npm signs the provenance with an identity token it fetches from GitHub's OIDC endpoint before it uploads anything, and
// that fetch now and then fails with IDENTITY_TOKEN_READ_ERROR, so a publish failing with that code is tried again, up
// to 3 times; any other failure fails the publish at once.
const publishTarball = async (tarball, attempt = 1) => {
  try {
    await run('npm', ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])])
  } catch (error) {
    if (attempt >= 3 || !error.output?.includes('npm error code IDENTITY_TOKEN_READ_ERROR')) throw error
    console.log(`npm could not read the identity token for ${tarball}, publishing it again`)
    await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt))
    await publishTarball(tarball, attempt + 1)
  }
}

const publishLayers = async () => {
  for (const layer of toLayers(pending)) {
    await Promise.all(
      layer.map(async ({ name, version }) => {
        await publishTarball(tarballOf.get(name))
        console.log(`${dryRun ? 'would publish' : 'published'} ${name}@${version}`)
      }),
    )
  }
}

if (packOnly) {
  for (const tarball of tarballOf.values()) console.log(`packed ${tarball}`)
} else {
  await publishLayers()
}
