import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { galleryItems } from './gallery-items'

const photo = (name: string) => ({ uri: `public:homes/${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg', url: `https://files.example/${name}.jpg` })
const holder = resource('home_photos').table('home_photos').fields({ id: f.integer(), home_id: f.relation('homes'), photo: f.file() }).primaryKey((r) => r.id).toModel()
const pair = resource('home_photos').table('home_photos').fields({ home_id: f.integer(), position: f.integer(), photo: f.file() }).primaryKey((r) => [r.home_id, r.position]).toModel()

describe('galleryItems', () => {
  it('shows the cover first, then each photo record with its key, less the cover shown again, whose record it takes', () => {
    const rows = [{ id: 1, photo: photo('garden') }, { id: 2, photo: photo('front') }, { id: 3, photo: photo('kitchen') }]
    expect(galleryItems(photo('front'), rows, 'photo', holder)).toEqual([{ file: photo('front'), key: '2' }, { file: photo('garden'), key: '1' }, { file: photo('kitchen'), key: '3' }])
    expect(galleryItems(photo('hall'), rows.slice(0, 1), 'photo', holder)).toEqual([{ file: photo('hall') }, { file: photo('garden'), key: '1' }])
  })

  it('leaves out empty values, missing files and documents', () => {
    const rows = [{ id: 1, photo: null }, { id: 2, photo: { uri: 'public:gone.jpg', missing: true } }, { id: 3, photo: { ...photo('plan'), type: 'application/pdf' } }, { id: 4, photo: photo('hall') }]
    expect(galleryItems(null, rows, 'photo', holder)).toEqual([{ file: photo('hall'), key: '4' }])
  })

  it('gives a photo no key when the caller cannot read it, or the gallery knows no photo records', () => {
    expect(galleryItems(undefined, [{ photo: photo('hall') }], 'photo', holder)).toEqual([{ file: photo('hall') }])
    expect(galleryItems(photo('front'), [], undefined, undefined)).toEqual([{ file: photo('front') }])
  })

  it('writes a composite key as the record API takes it', () => {
    expect(galleryItems(undefined, [{ home_id: 7, position: 2, photo: photo('hall') }], 'photo', pair)).toEqual([{ file: photo('hall'), key: '7,2' }])
  })
})
