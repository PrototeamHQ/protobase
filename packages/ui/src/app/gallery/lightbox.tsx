import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useFocusTrap } from '../../lib/use-focus-trap'
import { useIsDesktop } from '../../lib/use-media-query'
import { FileImage } from '../../live/file-image'
import { shownImage } from '../../live/file-values'
import { Sheet } from '../../primitives/sheet'
import { readDetailsOpen, writeDetailsOpen } from './details-open-storage'
import { keyStep, steppedPhoto, swipeStep, togglesDetails } from './gallery-layout'
import { text } from './messages'

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
   * The details of the photo at a position, which the info button shows in a sidebar beside it, or in a sheet over the
   * lower part of a mobile screen; `undefined` where the photo has none the user may read, which leaves out the button.
   */
  details?: (index: number) => ReactNode | undefined
  /** The details' heading and the info button's name, such as "Photo details". */
  detailsTitle?: string
}

const control =
  'flex size-10 shrink-0 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

/**
 * Photos one at a time at full size over the page: a modal dialog with a counter, arrows and keys (left, right, Escape)
 * that step through them, stopping at the first and the last, and a sideways swipe on a touch screen. For a photo with
 * details the user may read, an info button, or the `i` key, shows them in a sidebar beside it, or in a sheet over the
 * lower part of a mobile screen; this browser remembers whether they were left shown. The page does not scroll behind
 * it, and focus returns to what opened it.
 */
export const Lightbox = ({ title, photos, index, onIndex, onClose, details, detailsTitle = text('details') }: LightboxProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number }>(undefined)
  const sidebarId = useId()
  const desktop = useIsDesktop()
  const [detailsOpen, setDetailsOpen] = useState(() => readDetailsOpen(localStorage))
  // The sheet waits for the dialog's own focus trap, so the sheet's is the one on top, which Escape closes first
  const [trapped, setTrapped] = useState(false)
  useFocusTrap(panel, true, onClose)
  useEffect(() => setTrapped(true), [])
  const count = photos.length
  // At an end the arrow stays focusable, so the keys keep working, and does nothing
  const step = (by: number) => {
    const next = steppedPhoto(index, by, count)
    if (next !== index) onIndex(next)
  }
  const image = shownImage(photos[index], { width: 1600, height: 1200 })
  const shownDetails = details?.(index)
  const hasDetails = shownDetails !== undefined
  const toggleDetails = (open: boolean) => {
    setDetailsOpen(open)
    writeDetailsOpen(localStorage, open)
  }

  const key = (event: KeyboardEvent) => {
    if (hasDetails && togglesDetails(event)) {
      event.preventDefault()
      return toggleDetails(!detailsOpen)
    }
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
      <div className="flex h-dvh shrink-0 flex-col md:sticky md:top-0 md:min-w-0 md:flex-1">
        <div className="flex shrink-0 items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-background/85 px-3 py-1 font-medium tabular-nums text-foreground" aria-live="polite">
            {`${index + 1} / ${count}`}
          </span>
          <div className="flex items-center gap-2">
            {hasDetails && (
              <button
                type="button"
                className={cn(control, 'aria-expanded:bg-foreground aria-expanded:text-background')}
                aria-label={detailsTitle}
                aria-expanded={detailsOpen}
                aria-controls={desktop ? sidebarId : undefined}
                aria-keyshortcuts="i"
                onClick={() => toggleDetails(!detailsOpen)}
              >
                <Info className="size-4" aria-hidden />
              </button>
            )}
            <button type="button" className={control} aria-label={text('close')} onClick={onClose}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-3 pb-3 md:px-16" onPointerDown={down} onPointerUp={up} onPointerCancel={() => (start.current = undefined)}>
          {image && <FileImage key={image.url} image={image} className="max-h-full max-w-full select-none object-contain" />}
          {count > 1 && (
            <>
              <button type="button" className={cn(control, 'absolute left-3 top-1/2 -translate-y-1/2 aria-disabled:cursor-default aria-disabled:opacity-40')} aria-label={text('previousPhoto')} aria-disabled={index === 0} onClick={() => step(-1)}>
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button type="button" className={cn(control, 'absolute right-3 top-1/2 -translate-y-1/2 aria-disabled:cursor-default aria-disabled:opacity-40')} aria-label={text('nextPhoto')} aria-disabled={index === count - 1} onClick={() => step(1)}>
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
      {hasDetails && detailsOpen && desktop && (
        <aside id={sidebarId} aria-label={detailsTitle} className="min-h-dvh w-[360px] shrink-0 border-l border-border bg-background p-5 text-foreground">
          <h2 className="mb-3 text-[16px] font-semibold">{detailsTitle}</h2>
          {shownDetails}
        </aside>
      )}
      <Sheet title={detailsTitle} open={hasDetails && detailsOpen && !desktop && trapped} onClose={() => toggleDetails(false)}>
        <div className="pt-3">{shownDetails}</div>
      </Sheet>
    </div>
  )
}
