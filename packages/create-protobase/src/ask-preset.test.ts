import { describe, expect, it } from 'vitest'
import { askPreset, presetForAnswer } from './ask-preset'

const names = ['scratch', 'erp', 'real-estate']

describe('presetForAnswer', () => {
  it('takes the first preset for an empty answer', () => {
    expect(presetForAnswer(names, '  ')).toBe('scratch')
  })

  it('takes a preset by its number or its name', () => {
    expect(presetForAnswer(names, '2')).toBe('erp')
    expect(presetForAnswer(names, 'real-estate\n')).toBe('real-estate')
  })

  it('has nothing for another answer', () => {
    expect(presetForAnswer(names, '4')).toBeUndefined()
    expect(presetForAnswer(names, '1.5')).toBeUndefined()
    expect(presetForAnswer(names, 'crm')).toBeUndefined()
  })
})

describe('askPreset', () => {
  it('asks again until the answer names a preset', async () => {
    const answers = ['crm', '3']
    const asked: string[] = []
    const question = async (text: string) => {
      asked.push(text)
      return answers.shift()!
    }
    expect(await askPreset(names, question)).toBe('real-estate')
    expect(asked).toEqual(['Preset [1-3]: ', 'Preset [1-3]: '])
  })
})
