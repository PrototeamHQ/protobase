import { describe, expect, it } from 'vitest'
import { cardsLayoutOf } from './cards-layout'

describe('cardsLayoutOf', () => {
  it('stacks the cards, two thirds wide once in a carousel, when the props name neither', () => {
    expect(cardsLayoutOf({})).toEqual({ layout: 'stack', cardWidth: '2/3' })
    expect(cardsLayoutOf({ layout: 'carousel' })).toEqual({ layout: 'carousel', cardWidth: '2/3' })
  })

  it('keeps what the props name', () => {
    expect(cardsLayoutOf({ layout: 'carousel', cardWidth: '1/4' })).toEqual({ layout: 'carousel', cardWidth: '1/4' })
  })
})
