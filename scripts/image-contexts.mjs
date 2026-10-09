// Writes the build context of the protobase and protobase-dev images (docker/<image>/Dockerfile) to
// dist/images/<image>, at the version in package.json: protobase-serve.js from `pnpm build:serve`, and presets/<name>
// from `pnpm presets:write`, whose bun.lock files bun resolves from npm, so the @protobase packages must be published
// at that version. The release workflow runs it at the release tag.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
}

rmSync('dist/images', { recursive: true, force: true })
run('pnpm', ['build:serve', '--out', 'dist/images/protobase/protobase-serve.js'])
run('pnpm', ['presets:write', version, 'dist/images/protobase-dev/presets'])
console.log(`wrote the image contexts for ${version} to dist/images`)
