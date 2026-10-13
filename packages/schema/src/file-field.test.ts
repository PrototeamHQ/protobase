import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'

const width = { accepts: ['image/*'], run: () => 1 }

const products = (fields: Record<string, ReturnType<typeof f.text> | ReturnType<typeof f.file> | ReturnType<typeof f.integer>>) =>
  resource('products').table('products').fields({ id: f.integer().readOnly(), ...fields }).primaryKey((r) => r.id)

describe('f.file()', () => {
  it('keeps its settings through any order of calls, and shows them in the model', () => {
    const image = f.file().optional().accept(['image/*']).maxSize('10 MB').readOnly().public()
    expect(image.meta).toMatchObject({ type: 'file', nullable: true, readOnly: true, file: { accept: ['image/*'], maxSize: 10_000_000, provider: 'public' } })

    const model = products({ image: f.file().accept(['image/*']).derive({ width }), width: f.integer().readOnly(), datasheet: f.file().storage('archive') }).toModel()
    expect(model.fields.image!.file).toEqual({ accept: ['image/*'], maxSize: 50_000_000, provider: 'private', derive: ['width'] })
    expect(model.fields.datasheet!.file).toEqual({ accept: [], maxSize: 50_000_000, provider: 'archive' })
    expect(model.fields.width!.file).toBeUndefined()
  })

  it('show the placeholder as a derived field, and the variants and original as written', () => {
    const card = { width: 640, height: 480, fit: 'cover' as const, format: 'webp' as const, quality: 75 }
    const photo = f.file().accept(['image/*']).placeholder('photo_placeholder').variants({ card }, { original: { width: 2560, format: 'webp' } })
    const model = products({ photo, photo_placeholder: f.text().readOnly() }).toModel()
    expect(model.fields.photo!.file).toEqual({
      accept: ['image/*'],
      maxSize: 50_000_000,
      provider: 'private',
      derive: ['photo_placeholder'],
      placeholder: 'photo_placeholder',
      variants: { card },
      original: { width: 2560, format: 'webp' },
    })
    const more = photo.variants({ thumb: { width: 96, height: 96, fit: 'cover', format: 'avif' } })
    expect(Object.keys(more.meta.file!.variants!)).toEqual(['card', 'thumb'])
  })

  it('refuse a placeholder field that is missing, writable, not text, or derived as well', () => {
    const photo = f.file().placeholder('photo_placeholder')
    expect(() => products({ photo }).toModel()).toThrow('derives "photo_placeholder", which is not a field')
    expect(() => products({ photo, photo_placeholder: f.text() }).toModel()).toThrow('which must be readOnly()')
    expect(() => products({ photo, photo_placeholder: f.integer().readOnly() }).toModel()).toThrow('which must be a text field')
    expect(() => products({ photo: photo.derive({ photo_placeholder: width }), photo_placeholder: f.text().readOnly() }).toModel()).toThrow('derives it as well')
  })

  it('stores text and refuses anything else', () => {
    expect(f.file().schema.safeParse('private:acme/a.png?name=a.png&size=1').success).toBe(true)
    expect(f.file().schema.safeParse('').success).toBe(false)
    expect(f.file().schema.safeParse({ uri: 'x' }).success).toBe(false)
  })

  it('refuse derived fields that are missing, writable or files', () => {
    expect(() => products({ image: f.file().derive({ width }) }).toModel()).toThrow('file field "image" derives "width", which is not a field')
    expect(() => products({ image: f.file().derive({ width }), width: f.integer() }).toModel()).toThrow('which must be readOnly()')
    expect(() => products({ image: f.file().derive({ thumb: width }), thumb: f.file().readOnly() }).toModel()).toThrow('which is a file field')
  })

  it('refuse filters, sorts and keys on a file', () => {
    expect(() => products({ image: f.file().filterable() }).toModel()).toThrow('file field "image" cannot be filterable')
    expect(() => resource('p').table('p').fields({ image: f.file() }).primaryKey((r) => r.image).toModel()).toThrow('cannot be a key')
  })
})
