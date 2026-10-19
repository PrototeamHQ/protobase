import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPreset, presetNames } from './presets'

const templates = (...names: string[]) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-protobase-templates-'))
  for (const name of names) mkdirSync(path.join(dir, name))
  return dir
}

describe('presetNames', () => {
  it('lists every template folder, scratch first and the others by name', () => {
    const dir = templates('real-estate', 'scratch', 'erp')
    writeFileSync(path.join(dir, 'notes.txt'), '')
    expect(presetNames(dir)).toEqual(['scratch', 'erp', 'real-estate'])
  })

  it('refuses templates without scratch', () => {
    expect(() => presetNames(templates('erp'))).toThrow('no scratch preset')
  })
})

describe('checkPreset', () => {
  it('returns a known name', () => {
    expect(checkPreset(['scratch', 'erp'], 'erp')).toBe('erp')
  })

  it('names the valid presets for an unknown one', () => {
    expect(() => checkPreset(['scratch', 'erp'], 'crm')).toThrow('unknown preset crm: pick one of scratch, erp')
  })
})
