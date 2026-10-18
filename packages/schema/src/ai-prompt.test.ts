import { describe, expect, it } from 'vitest'
import { promptError, promptFields, renderPrompt } from './ai-prompt'

describe('AI prompts', () => {
  it('lists the fields a prompt names, once each', () => {
    expect(promptFields('Summarise {title}\n\n{description}, {title}')).toEqual(['title', 'description'])
    expect(promptError('Summarise this')).toBe('its prompt must name at least one {field} of the record')
    expect(promptError('Summarise {title}')).toBeUndefined()
  })

  it('renders each kind of value as text, a missing one empty, without percent-encoding', () => {
    const record = { title: 'A & B?', count: 3, open: false, big: 12n, none: null, tags: ['a', 'b'] }
    expect(renderPrompt('{title}|{count}|{open}|{big}|{none}|{missing}|{tags}', record)).toBe('A & B?|3|false|12|||["a","b"]')
  })
})
