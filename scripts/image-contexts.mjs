// Writes the build context of the protobase and protobase-dev images (docker/<image>/Dockerfile) to
// dist/images/<image>, at the version in package.json: protobase-serve.js from `bun run build:serve --bun`, the shell
// (the admin app every bundle shares) from `protobase build-shell`, and presets/<name>
// from `bun run presets:write`, whose bun.lock files bun resolves from npm, so the @protobase packages must be published
// at that version. The release workflow runs it at the release tag, for one image at a time: the images named as
// arguments, or both.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
}

const writers = {
  protobase: () => {
    run('bun', ['run', 'build:serve', '--bun', '--out', 'dist/images/protobase/protobase-serve.js'])
    run('bun', ['run', 'protobase', 'build-shell', 'dist/images/protobase/shell'])
  },
  'protobase-dev': () => run('bun', ['run', 'presets:write', version, 'dist/images/protobase-dev/presets']),
}
const images = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(writers)
const unknown = images.filter((image) => !writers[image])
if (unknown.length > 0) throw new Error(`unknown images ${unknown.join(', ')}, expected ${Object.keys(writers).join(', ')}`)

for (const image of images) {
  rmSync(`dist/images/${image}`, { recursive: true, force: true })
  writers[image]()
}
console.log(`wrote the image contexts of ${images.join(', ')} for ${version} to dist/images`)
