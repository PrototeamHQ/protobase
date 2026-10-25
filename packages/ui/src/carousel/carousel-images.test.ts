import { describe, expect, it } from 'vitest'
import { carouselSlides } from './carousel-images'

const file = (name: string) => ({ uri: `public:presets/${name}.png`, name: `${name}.png`, type: 'image/png', size: 1024, url: `/files/${name}.png` })

describe('carouselSlides', () => {
  it('draws links and files in their order, with what each shows', () => {
    expect(carouselSlides([{ src: '/shots/board.png', alt: 'The board' }, { ...file('list'), alt: 'The list' }, file('map')])).toEqual([
      { image: { url: '/shots/board.png' }, alt: 'The board' },
      { image: { url: '/files/list.png' }, alt: 'The list' },
      { image: { url: '/files/map.png' }, alt: '' },
    ])
  })

  it('draws the smallest variant that covers the frame', () => {
    const variants = { small: { url: '/files/list.small.webp', type: 'image/webp', width: 1000, height: 750 }, large: { url: '/files/list.large.webp', type: 'image/webp', width: 1600, height: 1200 } }
    expect(carouselSlides([{ ...file('list'), variants }])).toEqual([{ image: { url: '/files/list.large.webp' }, alt: '' }])
  })

  it('leaves out missing files and files that are no image', () => {
    expect(carouselSlides([{ uri: 'public:presets/gone.png', missing: true }, { ...file('notes'), type: 'application/pdf' }, file('map')])).toEqual([{ image: { url: '/files/map.png' }, alt: '' }])
  })
})
