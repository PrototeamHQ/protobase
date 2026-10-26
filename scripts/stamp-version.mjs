// Writes the version of a release tag into the root package.json, every packages/*/package.json that has a version
// and bun.lock, in the release workflow's runner only, never committed: the repository's package.json files are not
// bumped, and a release's version is its v* tag. bun.lock matters too, since `bun pm pack` pins the workspace:*
// dependencies at the versions it records. The publish and image jobs run it at the tag after `bun install` and before
// they build, so the packages and images are at the release's version, also when a run by hand publishes an existing
// tag again: `bun scripts/stamp-version.mjs v0.1.0`.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { releaseVersion } from './release-tag.ts'

const version = releaseVersion(process.argv[2] ?? '')
if (!version) throw new Error('usage: bun scripts/stamp-version.mjs v<x.y.z>')

const manifests = ['package.json', ...readdirSync('packages').map((dir) => path.join('packages', dir, 'package.json'))]
  .map((file) => ({ file, manifest: JSON.parse(readFileSync(file, 'utf8')) }))
  .filter(({ manifest }) => manifest.version)
for (const { file, manifest } of manifests) writeFileSync(file, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
const locked = spawnSync('bun', ['install', '--lockfile-only'], { stdio: 'inherit' })
if (locked.status !== 0) throw new Error(`bun install --lockfile-only failed with status ${locked.status}`)
console.log(`stamped ${version} into ${manifests.map(({ file }) => file).join(', ')} and bun.lock`)
