import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { resizeStep, resizedWidth } from './column-resize'

/** The widths every header cell has now, by column id, so that resizing one column leaves the others as they are. */
const measuredWidths = (header: HTMLElement) =>
  Object.fromEntries([...header.querySelectorAll<HTMLElement>('[data-col-id]')].map((cell) => [cell.dataset.colId!, cell.offsetWidth]))

/**
 * Column widths the user sets by dragging a header cell's edge, or with the arrow keys on it, by column id. They live
 * as long as the grid does: a reload or another page shows the app's widths again.
 */
export const useColumnResize = (header: RefObject<HTMLElement | null>) => {
  const [widths, setWidths] = useState<Record<string, number>>({})

  // The first resize fixes every column at the width it has, so that only the one being dragged changes
  const startWidths = () => ({ ...(header.current ? measuredWidths(header.current) : {}), ...widths })

  const onPointerDown = (id: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const start = startWidths()
    const startX = event.clientX
    // Followed on the window, so the drag goes on wherever the pointer goes and ends wherever it is let go
    const onMove = (move: globalThis.PointerEvent) => setWidths({ ...start, [id]: resizedWidth(start[id] ?? 0, move.clientX - startX) })
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const onKeyDown = (id: string, event: KeyboardEvent<HTMLElement>) => {
    const delta = event.key === 'ArrowRight' ? resizeStep : event.key === 'ArrowLeft' ? -resizeStep : 0
    if (delta === 0) return
    event.preventDefault()
    const start = startWidths()
    setWidths({ ...start, [id]: resizedWidth(start[id] ?? 0, delta) })
  }

  return { widths, onPointerDown, onKeyDown }
}
