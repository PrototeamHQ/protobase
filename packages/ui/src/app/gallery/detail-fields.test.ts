import { describe, expect, it } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import { detailFields } from './detail-fields'

const photos = resource('home_photos')
  .table('home_photos')
  .fields({ id: f.integer(), home_id: f.relation('homes'), position: f.integer(), photo: f.file(), caption: f.text(), owner_email: f.text().sensitive() })
  .primaryKey((r) => r.id)
const model = photos.toModel()

describe('detailFields', () => {
  it("takes the fields of the photo's sections, less those the gallery shows and sensitive ones", () => {
    const laidOut = view<typeof photos>('home_photos').layout((r) => [l.section('Photo', [r.caption, r.photo, r.home_id]), l.section('More', [r.caption, r.position, r.owner_email])]).toModel(model)
    expect(detailFields(model, laidOut, ['photo', 'home_id'])).toEqual(['caption', 'position'])
  })

  it('takes every field but the key without a layout, and none when the gallery shows them all', () => {
    expect(detailFields(model, undefined, ['photo', 'home_id'])).toEqual(['position', 'caption'])
    expect(detailFields(model, undefined, ['photo', 'home_id', 'position', 'caption'])).toEqual([])
  })
})
