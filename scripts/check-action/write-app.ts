// `bun scripts/check-action/write-app.ts <packDir> <outDir>`: writes the property-portal preset to <outDir> as an app
// has it, with its @protobase packages the tarballs `node scripts/publish.mjs --pack --out <packDir>` packed from this
// checkout, and locks it, so the check action (actions/check) runs on this checkout's Protobase.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { presets } from '../../packages/presets/src/presets'
import { writePresetFiles } from '../../packages/presets/src/write-preset'
import { lockedVersions } from './locked-versions'

type Packed = { name: string; version: string; tarball: string }

const [packDir, outDir] = process.argv.slice(2)
if (!packDir || !outDir) throw new Error('usage: bun scripts/check-action/write-app.ts <packDir> <outDir>')

const packed: Packed[] = JSON.parse(readFileSync(path.join(packDir, 'packages.json'), 'utf8'))
const tarballs = Object.fromEntries(packed.map(({ name, tarball }) => [name, `file:${path.resolve(packDir, tarball)}`]))
const preset = presets.find(({ name }) => name === 'property-portal')!
writePresetFiles(preset, packed[0]!.version, outDir)

// The app lists its @protobase packages at the packed version, as the CLI requires, and each of them resolves to its
// tarball, as do the ones they depend on. Their own dependencies resolve at the versions this checkout's bun.lock
// records, so a release published upstream since cannot break the check before this checkout's code runs.
const locked = lockedVersions(Bun.JSONC.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'bun.lock'), 'utf8')))
const file = path.join(outDir, 'package.json')
const overrides = { ...locked, ...tarballs }
writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), overrides }, null, 2)}\n`)
execFileSync('bun', ['install', '--lockfile-only'], { cwd: outDir, stdio: 'inherit' })
