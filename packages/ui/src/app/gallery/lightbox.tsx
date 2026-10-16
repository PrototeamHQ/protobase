import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useFocusTrap } from '../../lib/use-focus-trap'
import { FileImage } from '../../live/file-image'
import { shownImage } from '../../live/file-values'
import { keyStep, steppedPhoto, swipeStep } from './gallery-layout'

export type LightboxProps = {
  /** The dialog's accessible name, such as the gallery's title. */
  title: string
  /** The photos' files, in order. */
  photos: readonly unknown[]
  /** The photo shown. */
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  /**
   * The details of the photo at a position, shown in a sidebar beside it, or below it on a mobile screen; `undefined`
   * where the photo has none the user may read, which shows the photo alone.
   */
  details?: (index: number) => ReactNode | undefined
  /** The sidebar's heading, such as "Photo details". */
  detailsTitle?: string
}

const control =
  'flex size-10 shrink-0 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

/**
 * Photos one at a time at full size over the page: a modal dialog with a counter, arrows and keys (left, right, Escape)
 * that step through them, stopping at the first and the last, a sideways swipe on a touch screen, and, for a photo with details the user may
 * read, those details in a sidebar beside it, or below it on a mobile screen, where the dialog scrolls down to them. The
 * page does not scroll behind it, and focus returns to what opened it.
 */
export const Lightbox = ({ title, photos, index, onIndex, onClose, details, detailsTitle = 'Details' }: LightboxProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number }>(undefined)
  useFocusTrap(panel, true, onClose)
  const count = photos.length
  // At an end the arrow stays focusable, so the keys keep working, and does nothing
  const step = (by: number) => {
    const next = steppedPhoto(index, by, count)
    if (next !== index) onIndex(next)
  }
  const image = shownImage(photos[index], { width: 1600, height: 1200 })
  const shownDetails = details?.(index)

  const key = (event: KeyboardEvent) => {
    const by = keyStep(event.key)
    if (by === 0) return
    event.preventDefault()
    step(by)
  }
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') start.current = { x: event.clientX, y: event.clientY }
  }
  const up = (event: PointerEvent) => {
    if (!start.current) return
    step(swipeStep(event.clientX - start.current.x, event.clientY - start.current.y))
    start.current = undefined
  }

  // The dialog is the page while it is open: it scrolls to details taller than the screen, with the photo kept in view
  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={key} className="fixed inset-0 z-[90] flex flex-col overflow-y-auto overscroll-contain bg-backdrop outline-none md:flex-row">
      <div className={cn('flex shrink-0 flex-col md:sticky md:top-0 md:h-dvh md:min-w-0 md:flex-1', shownDetails === undefined ? 'h-dvh' : 'h-[85svh]')}>
        <div className="flex shrink-0 items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-background/85 px-3 py-1 text-[13px] font-medium tabular-nums text-foreground" aria-live="polite">
            {`${index + 1} / ${count}`}
          </span>
          <button type="button" className={control} aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-3 pb-3 md:px-16" onPointerDown={down} onPointerUp={up} onPointerCancel={() => (start.current = undefined)}>
          {image && <FileImage key={image.url} image={image} className="max-h-full max-w-full select-none object-contain" />}
          {count > 1 && (
            <>
              <button type="button" className={cn(control, 'absolute left-3 top-1/2 -translate-y-1/2 aria-disabled:cursor-default aria-disabled:opacity-40')} aria-label="Previous photo" aria-disabled={index === 0} onClick={() => step(-1)}>
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button type="button" className={cn(control, 'absolute right-3 top-1/2 -translate-y-1/2 aria-disabled:cursor-default aria-disabled:opacity-40')} aria-label="Next photo" aria-disabled={index === count - 1} onClick={() => step(1)}>
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
      {shownDetails !== undefined && (
        <aside aria-label={detailsTitle} className="shrink-0 border-t border-border bg-background p-5 text-foreground md:min-h-dvh md:w-[360px] md:border-l md:border-t-0">
          <h2 className="mb-3 text-[15px] font-semibold">{detailsTitle}</h2>
          {shownDetails}
        </aside>
      )}
    </div>
  )
}
