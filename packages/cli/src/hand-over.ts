import { realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { findPackageDirSync } from './build/packages/package-dir'
import { listedPackages, modeOf } from './version/project-packages'

/**
 * The folder of the @protobase/cli a locked project in `projectDir` has installed, when it is another CLI than the one
 * in `ownDir`: that one runs the project, at the version it is locked to. Undefined for a bundled project, which the
 * CLI that is started runs, and for a locked one without its own CLI installed.
 */
export const projectCliDir = (projectDir: string, ownDir: string): string | undefined => {
  if (modeOf(listedPackages(projectDir)) !== 'locked') return undefined
  const dir = findPackageDirSync('@protobase/cli', projectDir)
  if (!dir || realpathSync(dir) === realpathSync(ownDir)) return undefined
  return dir
}

type Run = (argv: string[]) => Promise<void>

/**
 * Runs the command in `argv` with the CLI the project in the current directory is locked to, the Angular CLI's and
 * Gulp's hand-over: a CLI installed globally, in CI or in an image, runs a locked project as its own CLI would, with a
 * line on stderr naming that CLI. Otherwise it runs `own`, the started CLI.
 */
export const runHandingOver = async (ownDir: string, own: () => Promise<Run>, argv: string[]) => {
  const projectDir = projectCliDir(process.cwd(), ownDir)
  if (!projectDir) return (await own())(argv)
  const { version } = (await import(pathToFileURL(path.join(projectDir, 'package.json')).href, { with: { type: 'json' } })).default as { version: string }
  process.stderr.write(`protobase: this project is locked; running its own @protobase/cli ${version}\n`)
  const { run } = (await import(pathToFileURL(path.join(projectDir, 'dist/index.js')).href)) as { run: Run }
  return run(argv)
}
