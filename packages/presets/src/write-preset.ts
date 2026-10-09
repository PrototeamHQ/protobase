import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { presetPath } from './preset-files'
import { presetPackage } from './preset-package'
import type { Preset } from './presets'

const root = path.join(import.meta.dirname, '..', '..', '..')

// The example's files as git sees them: tracked or new, never ignored ones such as node_modules, dist or .env.
const exampleFiles = (sourceDir: string) =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: sourceDir, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)

/**
 * Writes one preset to `outDir`: a standalone copy of its example with the @protobase packages at `version` and its
 * own bun.lock, which bun resolves from the registry, so those packages must be published at that version.
 */
export const writePreset = (preset: Preset, version: string, outDir: string) => {
  const sourceDir = path.join(root, preset.source)
  rmSync(outDir, { recursive: true, force: true })
  for (const file of exampleFiles(sourceDir)) {
    const target = presetPath(file)
    if (!target) continue
    mkdirSync(path.dirname(path.join(outDir, target)), { recursive: true })
    copyFileSync(path.join(sourceDir, file), path.join(outDir, target))
  }
  const source = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8'))
  writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(presetPackage(source, version), null, 2)}\n`)
  execFileSync('bun', ['install', '--lockfile-only'], { cwd: outDir, stdio: 'inherit' })
}
