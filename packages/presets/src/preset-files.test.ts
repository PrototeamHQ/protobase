import { describe, expect, it } from 'vitest'
import { presetPath } from './preset-files'

describe('presetPath', () => {
  it('keeps the project files where they are', () => {
    expect(presetPath('config/orders/data.ts')).toBe('config/orders/data.ts')
    expect(presetPath('AGENTS.md')).toBe('AGENTS.md')
    expect(presetPath('.env.example')).toBe('.env.example')
    expect(presetPath('.gitignore')).toBe('.gitignore')
  })

  it('leaves out the README, which documents the example in this repository', () => {
    expect(presetPath('README.md')).toBeUndefined()
    expect(presetPath('seed/README.md')).toBe('seed/README.md')
  })
})
