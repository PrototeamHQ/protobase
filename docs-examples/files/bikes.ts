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
    photo: f.file().accept(['image/*']).maxSize('10 MB').optional().derive({ photoWidth: imageSize('width'), photoRatio: aspectRatio() }),
    photoWidth: f.integer().readOnly().optional(),
    photoRatio: f.decimal({ precision: 8, scale: 4 }).readOnly().optional(),
    manual: f.file().accept(['application/pdf']).optional().derive({ manualBytes: fileSize(), manualSha256: sha256 }),
    manualBytes: f.integer().readOnly().optional(),
    manualSha256: f.text().readOnly().optional(),
    listing: f.file().accept(['image/png', 'image/jpeg', 'image/webp']).maxSize('2 MB').public().optional(),
  })
  .primaryKey((r) => r.id)
