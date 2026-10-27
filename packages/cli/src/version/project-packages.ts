import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type ProjectPackages = {
  /** The version specifier every listed @protobase package carries; undefined when none is listed. */
  specifier?: string
}

const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

type Manifest = Partial<Record<(typeof fields)[number], Record<string, string>>>

/**
 * The project's Protobase version specifier, from the package.json in `projectDir`. Every @protobase package it lists
 * must carry the same one: they are released together and pass values to each other.
 */
export const projectPackages = (projectDir: string): ProjectPackages => {
  const file = path.join(projectDir, 'package.json')
  if (!existsSync(file)) return {}
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest
  const listed = fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, specifier]) => (name.startsWith('@protobase/') ? [{ field, name, specifier }] : [])),
  )
  const [first] = listed
  if (!first) return {}
  const other = listed.find((entry) => entry.specifier !== first.specifier)
  if (other) throw new Error(`${file} lists ${first.name} at ${first.specifier} and ${other.name} at ${other.specifier}; list every @protobase package at the same version`)
  return { specifier: first.specifier }
}
