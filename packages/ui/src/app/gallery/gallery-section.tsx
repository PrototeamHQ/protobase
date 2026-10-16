import { Images } from 'lucide-react'
import { useState } from 'react'
import type { GalleryModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { FileImage } from '../../live/file-image'
import { humanize } from '../../live/naming'
import { shownImage } from '../../live/file-values'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { galleryTiles } from './gallery-layout'
import { Lightbox } from './lightbox'
import { PhotoDetails } from './photo-details'
import { useGalleryPhotos } from './use-gallery-photos'

// Where each tile sits from md up, by how many are drawn: the first large over two rows, the rest beside it. On a mobile
// screen only the first is drawn, across the whole gallery.
const spans: Record<number, string[]> = {
  1: ['md:col-span-4 md:row-span-2'],
  2: ['md:col-span-2 md:row-span-2', 'md:col-span-2 md:row-span-2'],
  3: ['md:col-span-2 md:row-span-2', 'md:col-span-2', 'md:col-span-2'],
  5: ['md:col-span-2 md:row-span-2', '', '', '', ''],
}

const Tile = ({ photo, large }: { photo: unknown; large: boolean }) => {
  const image = shownImage(photo, large ? { width: 960, height: 720 } : { width: 480, height: 360 })
  return image ? <FileImage image={image} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover/tile:scale-[1.02]" /> : null
}

/**
 * A record's photos as tiles, one large and the next ones smaller, the last counting those not drawn ("+N"); a mobile
 * screen draws the large one with the number of photos. Each tile opens the lightbox at its photo. A photo held by a
 * record of a resource the user may read has its details beside it there, as the record API answers them. A record
 * without photos has no gallery.
 */
export const GallerySection = ({ item, record, recordKey }: { item: GalleryModel; record: Record<string, unknown>; recordKey: string }) => {
  const { views } = useAdminMeta()
  const photos = useGalleryPhotos(item, record, recordKey)
  const photoPermissions = usePermissions(photos.holder?.name ?? '')
  const [open, setOpen] = useState<number>()
  if (photos.isPending) return <Section title={item.title}><Skeleton className="aspect-[4/3] w-full rounded-lg md:aspect-[2/1]" /></Section>
  if (photos.error) return <Section title={item.title}><ErrorBanner title="Could not load the photos" error={photos.error} /></Section>
  const count = photos.items.length
  if (count === 0) return null
  const { shown, more } = galleryTiles(count)
  const holder = photos.holder
  const holderView = holder && views[holder.name]
  // Reading a photo's record is the user's to do: its resource is in their `/meta`, readable, and they can read its key
  const readable = holder !== undefined && photoPermissions.read !== false
  const details = (index: number) => {
    const key = photos.items[index]?.key
    return readable && key !== undefined ? <PhotoDetails key={key} model={holder} view={holderView} photoKey={key} /> : undefined
  }

  return (
    <Section title={item.title}>
      <div className="grid aspect-[4/3] grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-lg md:aspect-[2/1]">
        {photos.items.slice(0, shown).map((photo, index) => {
          const last = index === shown - 1 && more > 0
          return (
            <button
              key={index}
              type="button"
              aria-label={last ? `Show all ${count} photos` : `Show photo ${index + 1} of ${count}`}
              onClick={() => setOpen(index)}
              className={cn(
                'group/tile relative overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                index === 0 ? 'col-span-4 row-span-2' : 'max-md:hidden',
                spans[shown]![index],
              )}
            >
              <Tile photo={photo.file} large={index === 0} />
              {last && <span className="absolute inset-0 flex items-center justify-center bg-backdrop/55 text-lg font-semibold text-white" aria-hidden>{`+${more}`}</span>}
              {index === 0 && count > 1 && (
                <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground md:hidden" aria-hidden>
                  <Images className="size-3.5" />
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {open !== undefined && (
        <Lightbox
          title={item.title}
          photos={photos.items.map((photo) => photo.file)}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(undefined)}
          details={details}
          detailsTitle={holder && `${holderView?.names?.singular ?? humanize(holder.name)} details`}
        />
      )}
    </Section>
  )
}
