import path from 'node:path'
import { presets } from './presets'
import { writePreset } from './write-preset'

// `pnpm presets:write <version> <outDir>`: writes every preset to <outDir>/<name>, with the @protobase packages at
// <version>, which must be on npm since bun resolves each preset's bun.lock from it.
const [version, outDir] = process.argv.slice(2)
if (!version || !outDir) throw new Error('usage: pnpm presets:write <version> <outDir>')

for (const preset of presets) {
  writePreset(preset, version, path.resolve(outDir, preset.name))
  console.log(`wrote preset ${preset.name} at ${version}`)
}
