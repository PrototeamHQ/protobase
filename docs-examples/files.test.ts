import { describe, expect, it } from 'vitest'
import { bikes } from './files/bikes'
import project from './files/protobase.config'

// The documentation shows these files; this keeps what it says about them true.

const input = (type: string, bytes: Uint8Array<ArrayBuffer>) => ({ name: 'file', type, size: bytes.length, head: bytes, read: async () => new Blob([bytes]).stream() })

// The start of a 1200×800 JPEG photo: start of image, a JFIF segment and its frame header
const photo = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
])
const manual = new TextEncoder().encode('%PDF-1.4 a bike manual')

const derived = (field: 'photo' | 'manual') => bikes.state.fields![field]!.meta.file!.derive!

describe('files', () => {
  it('declare file fields with their allowed types, size, provider and derived fields', () => {
    const model = bikes.toModel()
    expect(model.fields.photo!.file).toEqual({ accept: ['image/*'], maxSize: 10_000_000, provider: 'private', derive: ['photoWidth', 'photoRatio'] })
    expect(model.fields.listing!.file).toMatchObject({ provider: 'public', maxSize: 2_000_000 })
    expect(model.fields.manual!.file).toMatchObject({ accept: ['application/pdf'], provider: 'private' })
  })

  it('derive the photo\'s size and shape, and the manual\'s size and hash', async () => {
    expect(await derived('photo').photoWidth!.run(input('image/jpeg', photo))).toBe(1200)
    expect(await derived('photo').photoRatio!.run(input('image/jpeg', photo))).toBe('1.5000')
    expect(await derived('manual').manualBytes!.run(input('application/pdf', manual))).toBe(22)
    expect(await derived('manual').manualSha256!.run(input('application/pdf', manual))).toMatch(/^[0-9a-f]{64}$/)
  })

  it('configure three providers, one of them public and one keeping files longer', () => {
    const providers = project.files!.providers!
    expect(Object.keys(providers)).toEqual(['private', 'public', 'archive'])
    expect(providers.public!.public).toBe(true)
    expect(providers.archive!.retention).toBe(30 * 86_400_000)
  })
})
