import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { presets } from './presets'

const root = path.join(import.meta.dirname, '..', '..', '..')
const manifest = (source: string) => JSON.parse(readFileSync(path.join(root, source, 'package.json'), 'utf8'))

describe('presets', () => {
  // One node_modules then fits every preset: bun's --frozen-lockfile refuses only a changed dependency.
  it('declare the same dependencies and devDependencies', () => {
    const [first, ...rest] = presets.map((preset) => manifest(preset.source))
    for (const other of rest) {
      expect(other.dependencies).toEqual(first.dependencies)
      expect(other.devDependencies).toEqual(first.devDependencies)
    }
  })

  it('carry the scripts every job relies on', () => {
    for (const preset of presets) {
      expect(Object.keys(manifest(preset.source).scripts)).toEqual(expect.arrayContaining(['db:migrate', 'typecheck', 'test']))
    }
  })
})
