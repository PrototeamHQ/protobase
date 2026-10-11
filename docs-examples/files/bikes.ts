import { f, resource } from '@protobase/schema'
import { aspectRatio, fileSize, imageSize, processor } from '@protobase/server'

// A processor of your own reads the whole file when it needs to: here a SHA-256, to spot the same manual uploaded twice.
const sha256 = processor({
  run: async (file) => {
    const digest = await crypto.subtle.digest('SHA-256', await new Response(await file.read()).arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  },
})

// A bike shop's bikes for sale: a photo with its size in two more columns, a manual, and a public picture for the
// shop's website.
export const bikes = resource('bikes')
  .table('shop.bikes')
  .fields({
    id: f.integer().readOnly().dbDefault(),
    name: f.text(),
    photo: f.file().accept(['image/*']).maxSize('10 MB').optional().derive({ photo_width: imageSize('width'), photo_ratio: aspectRatio() }),
    photo_width: f.integer().readOnly().optional(),
    photo_ratio: f.decimal({ precision: 8, scale: 4 }).readOnly().optional(),
    manual: f.file().accept(['application/pdf']).optional().derive({ manual_bytes: fileSize(), manual_sha256: sha256 }),
    manual_bytes: f.integer().readOnly().optional(),
    manual_sha256: f.text().readOnly().optional(),
    listing: f.file().accept(['image/png', 'image/jpeg', 'image/webp']).maxSize('2 MB').public().optional(),
  })
  .primaryKey((r) => r.id)
