// Publishes every packages/* package to npm at the version in its package.json, skipping a version npm already has, so
// a missed or half-done publish can be run again. Each package is packed with pnpm (which builds it in `prepack`,
// points exports, types and bin at dist and pins the workspace:* dependencies) and the tarball published with npm,
// which authenticates with trusted publishing (OIDC) and adds provenance in the release workflow. `--dry-run` packs
// and runs `npm publish --dry-run` instead.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Dependencies before their dependents, so a package is never on npm before the @protobase packages it needs. The
// presets come last: packing them writes each one's bun.lock, which bun resolves from npm at this version.
const packages = ['schema', 'layout', 'query', 'client', 'server', 'ui', 'cli', 'presets']
const dryRun = process.argv.slice(2).includes('--dry-run')
const outDir = mkdtempSync(path.join(tmpdir(), 'protobase-publish-'))

const run = (command, args, cwd = '.') => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
}

// The version npm has of name@version, empty when it has none.
const publishedVersion = (name, version) => spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' }).stdout.trim()

// npm can take a while to serve a version it has just accepted, and bun resolves the presets' dependencies from it.
const waitUntilServed = (name, version) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (publishedVersion(name, version) === version) return
    spawnSync('sleep', ['10'])
  }
  throw new Error(`npm does not serve ${name}@${version} after 5 minutes`)
}

const manifest = (dir) => JSON.parse(readFileSync(path.join('packages', dir, 'package.json'), 'utf8'))

for (const dir of packages) {
  const packageDir = path.join('packages', dir)
  const { name, version } = manifest(dir)
  if (publishedVersion(name, version) === version) {
    console.log(`${name}@${version} is already on npm`)
    continue
  }
  if (dir === 'presets' && !dryRun) for (const other of packages.slice(0, -1)) waitUntilServed(manifest(other).name, version)
  run('pnpm', ['pack', '--pack-destination', outDir], packageDir)
  const tarball = path.join(outDir, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`)
  run('npm', ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])])
  console.log(`${dryRun ? 'would publish' : 'published'} ${name}@${version}`)
}
