import lint from '@commitlint/lint'
import load from '@commitlint/load'
import { describe, expect, it } from 'vitest'

const lintWith = async (file: string, message: string) => {
  const { rules, parserPreset } = await load({}, { file, cwd: import.meta.dirname })
  return lint(message, rules, parserPreset ? { parserOpts: parserPreset.parserOpts as object } : {})
}
const branchLint = (message: string) => lintWith('commitlint.branch.config.mjs', message)
const squashLint = (message: string) => lintWith('commitlint.config.mjs', message)

const subject = (length: number) => `fix(ui): ${'a'.repeat(length - 'fix(ui): '.length)}`

describe('the branch commit lint', () => {
  it('refuses a 94-character header', async () => {
    const result = await branchLint(subject(94))
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.name)).toEqual(['header-max-length'])
  })

  it('accepts a 93-character header', async () => {
    const result = await branchLint(subject(93))
    expect(result.valid).toBe(true)
  })
})

describe('the squash message of a 93-character subject', () => {
  it('passes as a single commit with its pull request number', async () => {
    const result = await squashLint(`${subject(93)} (#123)`)
    expect(result.valid).toBe(true)
  })

  it('passes as a body line beside a second commit', async () => {
    const message = `fix: a short title (#123)\n\n* ${subject(93)}\n\n* docs: a second commit\n`
    const result = await squashLint(message)
    expect(result.valid).toBe(true)
  })
})
