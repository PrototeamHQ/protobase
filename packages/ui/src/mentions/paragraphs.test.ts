import { describe, expect, it } from 'vitest'
import { paragraphsOf } from './paragraphs'

describe('paragraphsOf', () => {
  it('keeps one paragraph with its line breaks', () => {
    expect(paragraphsOf('one\ntwo')).toEqual(['one\ntwo'])
  })

  it('splits at blank lines, however many, and drops blank lines around the text', () => {
    expect(paragraphsOf('\n a\n\n \n\nb\r\nc\r\rd\n')).toEqual([' a', 'b\nc', 'd'])
  })

  it('gives nothing for blank text', () => {
    expect(paragraphsOf(' \n\t')).toEqual([])
  })
})
