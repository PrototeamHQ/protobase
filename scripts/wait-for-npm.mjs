// Waits until npm serves every published package (the @protobase packages and
// create-protobase, packages/* but the private ones) at the version in package.json, metadata and tarball, as `bun install` asks for them, then exits; after 30 minutes it fails, naming the packages still missing.
// npm's CDN caches each package's metadata for up to 5 minutes per Accept header, so a version can be on npm for one
// package and one request and not yet for another, and npm itself can take minutes to register a version it accepted
// (17 for 0.23.0 in release run 39261718830): the image contexts, which bun installs from npm, need them all
// as `bun install` sees them. Each build leg of image.yml runs it after its setup, before `bun run images:context`.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// What Bun 1.4 sends for a package's metadata in `bun install`; `bun info` asks for the full document instead.
const headers = {
  accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
  'accept-encoding': 'gzip, deflate, br, zstd',
}
const timeoutMs = 30 * 60 * 1000
const intervalMs = 10 * 1000

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const names = readdirSync('packages')
  .map((dir) => JSON.parse(readFileSync(path.join('packages', dir, 'package.json'), 'utf8')))
  .filter((manifest) => !manifest.private)
  .map((manifest) => manifest.name)

const served = async (name) => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, { headers })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`)
  const { versions } = await response.json()
  if (!(version in versions)) return false
  // The tarball can 404 for a while after the metadata lists the version (seen in release run 39183830934); bun GETs it.
  const tarball = await fetch(versions[version].dist.tarball, { headers })
  await tarball.body?.cancel()
  if (tarball.status === 404) return false
  if (!tarball.ok) throw new Error(`npm answered ${tarball.status} for the tarball of ${name}@${version}`)
  return true
}

const deadline = Date.now() + timeoutMs
let missing = names
while (true) {
  const results = await Promise.all(missing.map(served))
  missing = missing.filter((_, index) => !results[index])
  if (missing.length === 0) break
  if (Date.now() >= deadline) throw new Error(`npm does not serve ${missing.map((name) => `${name}@${version}`).join(', ')} after 30 minutes`)
  await new Promise((resolve) => setTimeout(resolve, intervalMs))
}
console.log(`npm serves ${names.map((name) => `${name}@${version}`).join(', ')}`)
