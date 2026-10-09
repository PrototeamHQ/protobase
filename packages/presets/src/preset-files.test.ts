import { describe, expect, it } from 'vitest'
import { presetPath } from './preset-files'

describe('presetPath', () => {
  it('keeps the project files where they are', () => {
    expect(presetPath('config/orders/data.ts')).toBe('config/orders/data.ts')
    expect(presetPath('AGENTS.md')).toBe('AGENTS.md')
    expect(presetPath('.env.example')).toBe('.env.example')
  })

  it('ships .gitignore as _gitignore, since npm leaves .gitignore files out of a package', () => {
    expect(presetPath('.gitignore')).toBe('_gitignore')
  })

  it('leaves out the README, which documents the example in this repository', () => {
    expect(presetPath('README.md')).toBeUndefined()
    expect(presetPath('seed/README.md')).toBe('seed/README.md')
  })
})
