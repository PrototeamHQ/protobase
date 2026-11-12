import { describe, expect, it } from 'vitest'
import { nextFocus } from './next-focus'

describe('nextFocus', () => {
  it('takes the next card', () => expect(nextFocus(['1', '2', '3'], ['1', '3'], '2')).toBe('3'))
  it('takes the previous card after the last', () => expect(nextFocus(['1', '2', '3'], ['1', '2'], '3')).toBe('2'))
  it('skips cards that left with it', () => expect(nextFocus(['1', '2', '3', '4'], ['1', '4'], '2')).toBe('4'))
  it('passes over a card that came in at the end', () => expect(nextFocus(['1', '2'], ['1', '5'], '2')).toBe('1'))
  it('finds none when no card is left', () => expect(nextFocus(['1'], [], '1')).toBeUndefined())
})
