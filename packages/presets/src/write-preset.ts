import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { presetPath } from './preset-files'
import { majorRange, presetPackage } from './preset-package'
import type { Preset } from './presets'

const root = path.join(import.meta.dirname, '..', '..', '..')

// The example's files as git sees them: tracked or new, never ignored ones such as node_modules, dist or .env.
const exampleFiles = (sourceDir: string) =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: sourceDir, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)

const writePackage = (sourceDir: string, range: string, outDir: string) => {
  const source = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8'))
  writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(presetPackage(source, range), null, 2)}\n`)
}

const lock = (outDir: string) => execFileSync('bun', ['install', '--lockfile-only'], { cwd: outDir, stdio: 'inherit' })

/** Writes one preset's files to `outDir`, without a lockfile: a standalone copy of its example with the @protobase packages in `range`. */
export const writePresetFiles = (preset: Preset, range: string, outDir: string) => {
  const sourceDir = path.join(root, preset.source)
  rmSync(outDir, { recursive: true, force: true })
  for (const file of exampleFiles(sourceDir)) {
    const target = presetPath(file)
    if (!target) continue
    mkdirSync(path.dirname(path.join(outDir, target)), { recursive: true })
    copyFileSync(path.join(sourceDir, file), path.join(outDir, target))
  }
  writePackage(sourceDir, range, outDir)
}

/**
 * Writes one preset to `outDir`: its files in `version`'s major range (see majorRange), so the app takes updates within
 * that major, and its own bun.lock, which bun resolves from the registry at exactly `version`, so those packages must be
 * published at that version.
 */
export const writePreset = (preset: Preset, version: string, outDir: string) => {
  // Locked at exactly `version` first; bun keeps that locked version when the range then widens around it.
  writePresetFiles(preset, version, outDir)
  lock(outDir)
  writePackage(path.join(root, preset.source), majorRange(version), outDir)
  lock(outDir)
}
