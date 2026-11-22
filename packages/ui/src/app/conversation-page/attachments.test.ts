import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { attachmentOf, attachmentsByMessage, isPreviewed } from './attachments'

const model = resource('attachments')
  .table('attachments')
  .fields({ id: f.integer().readOnly(), message_id: f.relation('messages').filterable(), file: f.file(), width: f.integer().optional(), height: f.integer().optional() })
  .primaryKey((r) => r.id)
  .toModel()

const attachments = { resource: 'attachments', field: 'message_id', file: 'file', width: 'width', height: 'height' }
const image = { id: 1, message_id: 7, file: { uri: 'private:1/a.png', name: 'a.png', type: 'image/png', size: 3_000, url: '/api/files/private/1/a.png?sig=x' }, width: 640, height: 480 }
const pdf = { id: 2, message_id: 7, file: { uri: 'private:1/b.pdf', name: 'b.pdf', type: 'application/pdf', size: 12_000, url: '/api/files/private/1/b.pdf?sig=y' }, width: null, height: null }
const missing = { id: 3, message_id: 8, file: { uri: 'private:1/c.png', missing: true }, width: null, height: null }

describe('attachmentOf', () => {
  it("reads the file's name, type, size and signed link, and an image's size", () => {
    expect(attachmentOf(image, model, attachments)).toEqual({ key: 1, name: 'a.png', type: 'image/png', size: 3_000, url: '/api/files/private/1/a.png?sig=x', width: 640, height: 480 })
    expect(attachmentOf(pdf, model, attachments)).toMatchObject({ key: 2, name: 'b.pdf', width: undefined, height: undefined })
  })

  it('has no link for a file missing from storage, and nothing for a record without a file', () => {
    expect(attachmentOf(missing, model, attachments)).toMatchObject({ key: 3, url: undefined, size: undefined })
    expect(attachmentOf({ id: 4, message_id: 8, file: null }, model, attachments)).toBeUndefined()
  })
})

describe('attachmentsByMessage', () => {
  it("groups the files by their message's key, in the order they came", () => {
    const byMessage = attachmentsByMessage([image, missing, pdf], model, attachments)
    expect([...byMessage.keys()]).toEqual(['7', '8'])
    expect(byMessage.get('7')!.map((file) => file.name)).toEqual(['a.png', 'b.pdf'])
  })
})

describe('isPreviewed', () => {
  it('shows a raster image with a link as an image, and anything else as a file', () => {
    expect(isPreviewed({ type: 'image/png', url: '/a.png' })).toBe(true)
    expect(isPreviewed({ type: 'image/png', url: undefined })).toBe(false)
    expect(isPreviewed({ type: 'image/svg+xml', url: '/a.svg' })).toBe(false)
    expect(isPreviewed({ type: 'application/pdf', url: '/b.pdf' })).toBe(false)
  })
})
