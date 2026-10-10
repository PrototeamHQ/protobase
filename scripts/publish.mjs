// Publishes every packages/* package to npm at the version in its package.json, skipping a version npm already has, so
// a missed or half-done publish can be run again. Each package is built, packed with Bun (which pins the workspace:*
// dependencies) and the tarball published with npm, which authenticates with trusted publishing (OIDC) and adds
// provenance in the release workflow. `--dry-run` packs and runs `npm publish --dry-run` instead.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Dependencies before their dependents, so a package is never on npm before the @protobase packages it needs.
const packages = ['schema', 'layout', 'query', 'client', 'server', 'ui', 'cli']
const dryRun = process.argv.slice(2).includes('--dry-run')
const outDir = mkdtempSync(path.join(tmpdir(), 'protobase-publish-'))

const run = (command, args, cwd = '.') => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
}

// `bun pm pack` ignores publishConfig, so its manifest fields (exports, types, bin) are applied to package.json for
// the pack, as pnpm and npm apply them, and the file is restored after. The package is built first: Bun runs prepack
// without the workspace's bins on PATH.
const pack = (packageDir) => {
  const file = path.join(packageDir, 'package.json')
  const original = readFileSync(file, 'utf8')
  const manifest = JSON.parse(original)
  const { access, registry, tag, ...fields } = manifest.publishConfig ?? {}
  writeFileSync(file, `${JSON.stringify({ ...manifest, ...fields, publishConfig: { access } }, null, 2)}\n`)
  try {
    run('bun', ['run', 'build'], packageDir)
    run('bun', ['pm', 'pack', '--ignore-scripts', '--quiet', '--destination', outDir], packageDir)
  } finally {
    writeFileSync(file, original)
  }
}

// The version npm has of name@version, empty when it has none.
const publishedVersion = (name, version) => spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' }).stdout.trim()

for (const dir of packages) {
  const packageDir = path.join('packages', dir)
  const { name, version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  if (publishedVersion(name, version) === version) {
    console.log(`${name}@${version} is already on npm`)
    continue
  }
  pack(packageDir)
  const tarball = path.join(outDir, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`)
  run('npm', ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])])
  console.log(`${dryRun ? 'would publish' : 'published'} ${name}@${version}`)
}
