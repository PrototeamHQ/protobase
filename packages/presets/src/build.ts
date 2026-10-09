import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { presets } from './presets'
import { writePreset } from './write-preset'

// `prepack`: writes every preset to dist/<name>, at this package's version, which the release shares with the
// @protobase packages. scripts/publish.mjs publishes this package after them, so bun finds them on npm.
const packageDir = path.join(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
rmSync(path.join(packageDir, 'dist'), { recursive: true, force: true })

for (const preset of presets) {
  writePreset(preset, version, path.join(packageDir, 'dist', preset.name))
  console.log(`wrote preset ${preset.name} at ${version}`)
}
