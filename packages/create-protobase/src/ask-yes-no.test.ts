import { describe, expect, it } from 'vitest'
import { askYesNo, yesForAnswer } from './ask-yes-no'

describe('yesForAnswer', () => {
  it('takes the fallback for an empty answer, yes for y or yes and no for anything else', () => {
    expect(yesForAnswer(' ', true)).toBe(true)
    expect(yesForAnswer('', false)).toBe(false)
    expect(yesForAnswer('Y', false)).toBe(true)
    expect(yesForAnswer('yes\n', false)).toBe(true)
    expect(yesForAnswer('n', true)).toBe(false)
    expect(yesForAnswer('sure', true)).toBe(false)
  })
})

describe('askYesNo', () => {
  it('shows the fallback in capitals', async () => {
    const asked: string[] = []
    const question = async (text: string) => (asked.push(text), '')
    expect(await askYesNo(question, 'Write ui.ts?', true)).toBe(true)
    expect(await askYesNo(question, 'Review?', false)).toBe(false)
    expect(asked).toEqual(['Write ui.ts? [Y/n]: ', 'Review? [y/N]: '])
  })
})
