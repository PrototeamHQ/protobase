import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The record and postgres jobs run these gates before `bun install`, which they run only when the gate says the suite
// must run, so a gate and everything it imports load nothing but Node's built-ins and the repository's own modules.
const gates = ['scripts/affected-recordings.mjs', 'scripts/affected-postgres.mjs', 'scripts/affected-snapshots.mjs']

const root = path.resolve(import.meta.dirname, '..', '..')
const specifier = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm

const packagesLoaded = (file: string, seen = new Set<string>()): string[] => {
  if (seen.has(file)) return []
  seen.add(file)
  const source = readFileSync(path.join(root, file), 'utf8')
  return [...source.matchAll(specifier)].flatMap(([, imported]) => {
    if (imported.startsWith('node:')) return []
    if (!imported.startsWith('.')) return [`${file}: ${imported}`]
    return packagesLoaded(path.relative(root, path.resolve(root, path.dirname(file), imported)), seen)
  })
}

describe('the gates that run before bun install', () => {
  it.each(gates)('%s loads no package', (gate) => {
    expect(packagesLoaded(gate)).toEqual([])
  })
})
