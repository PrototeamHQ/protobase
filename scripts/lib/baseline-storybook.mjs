import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A checkout of commit `sha` with its dependencies installed and its Storybook built in `storybook-static`, in a
 * temporary folder that later runs reuse.
 */
export const baselineCheckout = async (root, sha) => {
  // Its real path: the plugin build names modules by theirs, and macOS's temporary folder is behind a symlink
  const dir = join(realpathSync(tmpdir()), `protobase-layouts-${sha.slice(0, 12)}`)
  if (existsSync(join(dir, 'storybook-static', 'index.json'))) return dir
  console.log(`Building the Storybook of ${sha.slice(0, 12)} in ${dir} for the before screenshots`)
  await mkdir(dir, { recursive: true })
  const archive = `${dir}.tar`
  execFileSync('git', ['archive', '--output', archive, sha], { cwd: root, stdio: 'inherit' })
  execFileSync('tar', ['-xf', archive, '-C', dir], { stdio: 'inherit' })
  await rm(archive)
  const run = (command, ...args) => execFileSync(command, args, { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] })
  run('bun', 'install', '--frozen-lockfile', '--ignore-scripts')
  run('bun', 'x', 'storybook', 'build', '--quiet', '-o', 'storybook-static')
  return dir
}
