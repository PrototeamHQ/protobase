import { describe, expect, it } from 'vitest'
import { cardPhotoList, maxCardDots } from './card-photos'

const file = (name: string) => ({ uri: `public:listing_photos/${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg', size: 1024, url: `/files/${name}.jpg` })

describe('cardPhotoList', () => {
  it('puts the cover first, then the photos in their order', () => {
    expect(cardPhotoList(file('front'), [file('kitchen'), file('garden')])).toEqual([file('front'), file('kitchen'), file('garden')])
  })

  it('shows the cover once when it is among the photos too', () => {
    expect(cardPhotoList(file('front'), [file('front'), file('kitchen')])).toEqual([file('front'), file('kitchen')])
  })

  it('starts at the first photo without a cover, and leaves out empty values', () => {
    expect(cardPhotoList(null, [null, file('kitchen'), undefined, 'not a file'])).toEqual([file('kitchen')])
    expect(cardPhotoList(undefined, [])).toEqual([])
  })

  it('is the cover alone without photos', () => {
    expect(cardPhotoList(file('front'), [])).toEqual([file('front')])
  })

  it('holds as many as the card has dots, the cover among them', () => {
    const photos = Array.from({ length: maxCardDots }, (_, index) => file(`room-${index}`))
    expect(cardPhotoList(file('front'), photos)).toEqual([file('front'), ...photos.slice(0, maxCardDots - 1)])
    expect(cardPhotoList(undefined, photos)).toEqual(photos)
  })
})
