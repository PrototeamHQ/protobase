import { describe, expect, it } from 'vitest'
import { cardPhotoList, cardPhotosRequest, maxCardPhotos, scrolledPhoto, shownPhoto } from './card-photos'

const file = (name: string) => ({ uri: `public:listing_photos/${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg', size: 1024, url: `/files/${name}.jpg` })

describe('cardPhotosRequest', () => {
  const photos = { resource: 'listing_photos', field: 'listing_id', image: 'photo', sort: 'position' }

  it("asks for the photos of the card's record, in the display's order, with only the image and its placeholder", () => {
    expect(cardPhotosRequest(photos, '42')).toEqual({ filter: 'listing_id = "42"', orderBy: 'position', fields: ['photo'], pageSize: maxCardPhotos })
    expect(cardPhotosRequest(photos, '42', 'photo_placeholder').fields).toEqual(['photo', 'photo_placeholder'])
  })

  it('leaves the order to the list API when the display names none', () => {
    expect(cardPhotosRequest({ ...photos, sort: undefined }, '42')).not.toHaveProperty('orderBy')
  })

  it('quotes a key that is text', () => {
    expect(cardPhotosRequest(photos, 'a "b"').filter).toBe('listing_id = "a \\"b\\""')
  })
})

describe('cardPhotoList', () => {
  it('puts the cover first, then the loaded photos in their order', () => {
    expect(cardPhotoList(file('front'), [file('kitchen'), file('garden')])).toEqual([file('front'), file('kitchen'), file('garden')])
  })

  it('shows the cover once when it is among the photos too', () => {
    expect(cardPhotoList(file('front'), [file('front'), file('kitchen')])).toEqual([file('front'), file('kitchen')])
  })

  it('starts at the first photo without a cover, and leaves out empty values', () => {
    expect(cardPhotoList(null, [null, file('kitchen'), undefined, 'not a file'])).toEqual([file('kitchen')])
    expect(cardPhotoList(undefined, [])).toEqual([])
  })

  it('is the cover alone before the photos load', () => {
    expect(cardPhotoList(file('front'), [])).toEqual([file('front')])
  })
})

describe('shownPhoto', () => {
  it('steps forward and wraps from the last to the first', () => {
    expect([0, 1, 2, 3, 4].map((step) => shownPhoto(step, 3))).toEqual([0, 1, 2, 0, 1])
  })

  it('steps back from the first to the last', () => {
    expect([-1, -2, -3, -4].map((step) => shownPhoto(step, 3))).toEqual([2, 1, 0, 2])
  })

  it('stays on the first with one photo or none', () => {
    expect(shownPhoto(5, 1)).toBe(0)
    expect(shownPhoto(-2, 0)).toBe(0)
  })
})

describe('scrolledPhoto', () => {
  it('is the photo mostly in view, part way through a swipe', () => {
    expect([0, 100, 159, 161, 320, 470].map((left) => scrolledPhoto(left, 320, 3))).toEqual([0, 0, 0, 1, 1, 1])
  })

  it('stays within the photos when the track overscrolls', () => {
    expect(scrolledPhoto(-40, 320, 3)).toBe(0)
    expect(scrolledPhoto(2000, 320, 3)).toBe(2)
  })

  it('is the first before the track has a width or photos', () => {
    expect(scrolledPhoto(100, 0, 3)).toBe(0)
    expect(scrolledPhoto(100, 320, 0)).toBe(0)
  })
})
