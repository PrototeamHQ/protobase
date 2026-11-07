import type { ReactNode } from 'react'

/**
 * The canvas beside its side panel on a wide screen, where the canvas stays in view below the top bar as the page
 * scrolls down a long panel; on a narrower one the panel follows the canvas.
 */
export const GraphFrame = ({ canvas, panel }: { canvas: ReactNode; panel: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
    <div className="h-[28rem] overflow-hidden rounded-lg border max-sm:h-[22rem] lg:sticky lg:top-[calc(var(--pb-sticky-top,0px)+0.75rem)] lg:h-[max(28rem,calc(100dvh-var(--pb-sticky-top,0px)-var(--pb-sticky-bottom,0px)-12rem))]">{canvas}</div>
    <div className="flex min-w-0 flex-col gap-3">{panel}</div>
  </div>
)

/** The side panel's line while no node is chosen. */
export const PanelHint = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed px-4 py-6 text-center text-body text-muted-foreground">{children}</p>
