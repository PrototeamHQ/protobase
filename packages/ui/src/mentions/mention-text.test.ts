import { describe, expect, it } from 'vitest'
import { activeMention, bodyParts, insertMention, mentionedIds } from './mention-text'

describe('activeMention', () => {
  it('is the @ at the start or after whitespace, up to the caret', () => {
    expect(activeMention('@an', 3)).toEqual({ start: 0, query: 'an' })
    expect(activeMention('Thanks @vri', 11)).toEqual({ start: 7, query: 'vri' })
    expect(activeMention('Thanks\n@', 8)).toEqual({ start: 7, query: '' })
    expect(activeMention('Thanks @vri and more', 11)).toEqual({ start: 7, query: 'vri' })
  })

  it('is none inside an email address, after a space or without an @', () => {
    expect(activeMention('mail ann@example.com', 20)).toBeUndefined()
    expect(activeMention('Thanks @Ann de', 14)).toBeUndefined()
    expect(activeMention('Thanks', 6)).toBeUndefined()
  })
})

describe('insertMention', () => {
  it('writes the name with a space after it and puts the caret behind', () => {
    expect(insertMention('Thanks @vri', { start: 7, query: 'vri' }, 'Ann de Vries')).toEqual({ text: 'Thanks @Ann de Vries ', caret: 21 })
    expect(insertMention('@an for this', { start: 0, query: 'an' }, 'Ann')).toEqual({ text: '@Ann for this', caret: 5 })
  })
})

describe('mentionedIds', () => {
  const picked = [{ id: 'u1', name: 'Ann' }, { id: 'u2', name: 'Ann de Vries' }, { id: 'u3', name: 'Bo' }]

  it('keeps the picked users still written, each once, the longest name winning', () => {
    expect(mentionedIds('@Ann de Vries and @Bo, @Bo again', picked)).toEqual(['u2', 'u3'])
    expect(mentionedIds('@Ann and @Ann de Vries', picked)).toEqual(['u1', 'u2'])
  })

  it('drops a mention whose name was removed or changed', () => {
    expect(mentionedIds('Thanks @Annie and B', picked)).toEqual([])
    expect(mentionedIds('No one', picked)).toEqual([])
  })
})

describe('bodyParts', () => {
  it('marks each mention of a known name, the longest first, and leaves the rest as text', () => {
    expect(bodyParts('Hi @Ann de Vries and @Ann, see mail@Ann', [{ name: 'Ann' }, { name: 'Ann de Vries' }])).toEqual([
      { text: 'Hi ' },
      { mention: 'Ann de Vries' },
      { text: ' and ' },
      { mention: 'Ann' },
      { text: ', see mail@Ann' },
    ])
    expect(bodyParts('@Zoë, and @Zoëlla', [{ name: 'Zoë' }])).toEqual([{ mention: 'Zoë' }, { text: ', and @Zoëlla' }])
    expect(bodyParts('Hi @Bo', [{}])).toEqual([{ text: 'Hi @Bo' }])
  })
})
