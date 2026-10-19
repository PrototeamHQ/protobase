import { readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { majorRange } from './preset-package'
import { presets } from './presets'
import { writePresetFiles } from './write-preset'

// `bun ../presets/src/write-template.ts`, the build of packages/create-protobase run in its folder: writes its
// dist/template/, the scratch preset with the @protobase packages in the major range of that package's version, and no
// lockfile, which the new app's first install writes.
const packageDir = process.cwd()
const { name, version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
if (name !== 'create-protobase') throw new Error(`write-template.ts runs in packages/create-protobase, not in ${name}`)

const scratch = presets.find((preset) => preset.name === 'scratch')
if (!scratch) throw new Error('no scratch preset')
const outDir = path.join(packageDir, 'dist', 'template')
writePresetFiles(scratch, majorRange(version), outDir)
// Packing leaves these out of a tarball (npm the .gitignore, Bun the bunfig.toml), so the template carries each with a
// leading _, which create-protobase drops when it writes the project.
for (const file of ['.gitignore', 'bunfig.toml']) renameSync(path.join(outDir, file), path.join(outDir, `_${file}`))
console.log(`wrote dist/template/: the scratch preset at ${majorRange(version)}`)
