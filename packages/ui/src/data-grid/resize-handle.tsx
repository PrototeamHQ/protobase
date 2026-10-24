import type { KeyboardEvent, PointerEvent } from 'react'
import { minColumnWidth } from './column-resize'
import { text } from './messages'

export type ColumnResize = {
  onPointerDown: (id: string, event: PointerEvent<HTMLElement>) => void
  onKeyDown: (id: string, event: KeyboardEvent<HTMLElement>) => void
}

/**
 * The right edge of a header cell, dragged to make its column wider or narrower. It sits beside the sort button rather
 * than in it, so a drag never sorts.
 */
export const ResizeHandle = ({ id, header, width, resize }: { id: string; header: string; width?: number; resize: ColumnResize }) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label={text('resizeColumn', header)}
    aria-valuemin={minColumnWidth}
    aria-valuenow={width}
    tabIndex={0}
    onPointerDown={(event) => resize.onPointerDown(id, event)}
    onKeyDown={(event) => resize.onKeyDown(id, event)}
    className="group/resize absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none justify-end outline-none"
  >
    <div className="h-full w-0.5 bg-transparent group-hover/resize:bg-primary group-focus-visible/resize:bg-primary group-active/resize:bg-primary" />
  </div>
)
