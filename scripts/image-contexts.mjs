// Writes the build context of the protobase and protobase-dev images (docker/<image>/Dockerfile) to
// dist/images/<image>, at the version in package.json, from the @protobase packages npm serves at that version, so
// they must be published: protobase-serve.js from `protobase build-serve --bun` and the shell (the admin app every
// bundle shares) of @protobase/ui's dist/shell, both of @protobase/cli installed from npm into a scratch folder, and
// presets/<name> from `bun run presets:write`, whose bun.lock files bun resolves from npm. The release workflow runs it
// at the release tag, once npm serves the packages, for one image at a time: the images named as arguments, or both.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
}

// @protobase/cli at exactly this version, which pins @protobase/ui and the other @protobase packages to it, installed
// from npm outside the repository so nothing of the workspace resolves; its CLI runs on Bun.
const writeProtobase = (out) => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'protobase-image-'))
  try {
    const manifest = { private: true, dependencies: { '@protobase/cli': version } }
    writeFileSync(path.join(scratch, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    run('bun', ['install', '--silent'], scratch)
    const modules = path.join(scratch, 'node_modules')
    const cli = path.join(modules, '@protobase/cli/bin/protobase.mjs')
    run('bun', [cli, 'build-serve', '--bun', '--out', path.join(out, 'protobase-serve.js')], scratch)
    cpSync(path.join(modules, '@protobase/ui/dist/shell'), path.join(out, 'shell'), { recursive: true })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const writers = {
  protobase: () => writeProtobase(path.resolve('dist/images/protobase')),
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
