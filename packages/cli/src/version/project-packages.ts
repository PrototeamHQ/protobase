import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Whose @protobase packages dev, build and scripts use: `bundled`, the CLI's own, when the project's package.json lists
 * them in devDependencies or not at all, or there is no package.json; `locked`, the project's installed copies, when it
 * lists them in dependencies.
 */
export type ProtobaseMode = 'bundled' | 'locked'

export type ProjectPackages = {
  mode: ProtobaseMode
  /** The version specifier every listed @protobase package carries; undefined when none is listed. */
  specifier?: string
}

const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

type Manifest = Partial<Record<(typeof fields)[number], Record<string, string>>>

type Listed = { field: (typeof fields)[number]; name: string; specifier: string }

/** The @protobase packages the package.json in `projectDir` lists, each with its field and specifier; none without one. */
export const listedPackages = (projectDir: string): Listed[] => {
  const file = path.join(projectDir, 'package.json')
  if (!existsSync(file)) return []
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest
  return fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, specifier]) => (name.startsWith('@protobase/') ? [{ field, name, specifier }] : [])),
  )
}

/** Locked when any @protobase package is listed in dependencies, otherwise bundled. */
export const modeOf = (listed: Listed[]): ProtobaseMode => (listed.some((entry) => entry.field === 'dependencies') ? 'locked' : 'bundled')

/**
 * The project's mode and Protobase version specifier, from the package.json in `projectDir`. Every @protobase package
 * it lists must carry the same specifier: they are released together and pass values to each other.
 */
export const projectPackages = (projectDir: string): ProjectPackages => {
  const listed = listedPackages(projectDir)
  const [first] = listed
  if (!first) return { mode: 'bundled' }
  const other = listed.find((entry) => entry.specifier !== first.specifier)
  if (other) throw new Error(`${path.join(projectDir, 'package.json')} lists ${first.name} at ${first.specifier} and ${other.name} at ${other.specifier}; list every @protobase package at the same version`)
  return { mode: modeOf(listed), specifier: first.specifier }
}
