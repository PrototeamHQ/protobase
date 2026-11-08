import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { usePageScroll } from '../app-shell'
import { cn } from '../lib/cn'
import { BarMenu, BarNamed } from './bar-actions'
import { barSize, panelOverlays } from './bar-size'
import { FocusContext, type FocusHosts } from './focus-context'
import { createFocusStore } from './focus-store'
import { useElementWidth } from './use-element-width'
import { text } from './messages'

export type FocusPageProps = {
  /** What the page shows, such as a record's title: its hidden heading, which the breadcrumb shows to the eye. */
  label: string
  /** The surface, and the parts that fill the bar, notice and panels from inside it. */
  children: ReactNode
}

// One stable ref callback per host, each keeping its element in `hosts`.
const useHostRefs = (setHosts: Dispatch<SetStateAction<FocusHosts>>) =>
  useState(() => {
    const keep = (name: keyof FocusHosts) => (element: HTMLElement | null) => setHosts((current) => (current[name] === element ? current : { ...current, [name]: element }))
    return { mode: keep('mode'), controls: keep('controls'), state: keep('state'), secondary: keep('secondary'), primary: keep('primary'), notice: keep('notice'), start: keep('start'), end: keep('end') }
  })[0]

const zone = 'flex min-w-0 shrink-0 items-center gap-2 empty:hidden'

/**
 * A page for work on one big thing: a thin bar, one notice at a time, a surface that takes what is left, and at most a
 * panel on each side, which the surface makes room for. The page does not scroll, so the surface is the window; panels
 * scroll themselves since the page cannot. It knows nothing of what it shows: whatever owns a part fills it from
 * anywhere inside, with `FocusSlot`, `FocusActions`, `FocusNotice` and `FocusPanel`, and reads the room it has with
 * `useFocusPage()`.
 */
export const FocusPage = ({ label, children }: FocusPageProps) => {
  usePageScroll(false)
  const [store] = useState(createFocusStore)
  const [hosts, setHosts] = useState<FocusHosts>({})
  const refs = useHostRefs(setHosts)
  const [bar, barWidth] = useElementWidth()
  const [row, rowWidth] = useElementWidth()
  const size = barSize(barWidth)
  const overlays = panelOverlays(rowWidth)
  const value = useMemo(() => ({ store, hosts, size }), [store, hosts, size])
  return (
    <FocusContext.Provider value={value}>
      <section aria-label={label} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <h1 className="sr-only">{label}</h1>
        <div ref={bar} role="group" aria-label={text('tools')} className="flex min-h-12 shrink-0 items-center gap-2 border-b bg-background px-3 max-md:min-h-14">
          <div ref={refs.mode} className={cn(zone, 'shrink')} />
          <div ref={refs.controls} className={zone} />
          <div className="min-w-0 flex-1" />
          <div ref={refs.state} className={cn(zone, 'shrink text-xs text-muted-foreground')} />
          <BarNamed />
          <div ref={refs.secondary} className={zone} />
          <div ref={refs.primary} className={zone} />
          <BarMenu />
        </div>
        <div ref={refs.notice} className="shrink-0 empty:hidden" />
        <div ref={row} className="relative flex min-h-0 flex-1">
          <div ref={refs.start} className={cn('h-full shrink-0 empty:hidden', overlays && 'absolute inset-y-0 left-0 z-10 shadow-pop')} />
          {/* Isolated, so nothing in the surface rises above a panel that lies over it */}
          <div className="relative isolate min-h-0 min-w-0 flex-1">{children}</div>
          <div ref={refs.end} className={cn('h-full shrink-0 empty:hidden', overlays && 'absolute inset-y-0 right-0 z-10 shadow-pop')} />
        </div>
      </section>
    </FocusContext.Provider>
  )
}
