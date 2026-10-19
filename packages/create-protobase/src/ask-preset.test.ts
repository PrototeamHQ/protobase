import { describe, expect, it } from 'vitest'
import { presetForAnswer } from './ask-preset'

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
