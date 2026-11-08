import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { SidePanel } from '../side-panel'
import { useFocusParts } from './focus-context'
import type { FocusAction, FocusZone } from './focus-store'
import type { NoticeLevel } from './notice-order'

export type FocusSlotProps = {
  /**
   * `mode` says what shows and picks it, `controls` holds tools for the surface, `state` says how the work stands,
   * `secondary` and `primary` hold the page's own buttons, the primary far right.
   */
  zone: FocusZone
  /** Shows only while nothing else fills the zone, as the framework's Save and save state do. */
  fallback?: boolean
  children: ReactNode
}

/** Draws its children in a zone of the focus page's bar, wherever it is drawn inside the page. */
export const FocusSlot = ({ zone, fallback = false, children }: FocusSlotProps) => {
  const { store, hosts } = useFocusParts()
  useLayoutEffect(() => (fallback ? undefined : store.fill(zone)), [store, zone, fallback])
  const taken = useFocusZoneFilled(zone)
  const host = hosts[zone]
  return host && !(fallback && taken) ? createPortal(children, host) : null
}

/** Whether a part fills the zone, so another can step aside, as Save does for a primary of the surface's own. */
export const useFocusZoneFilled = (zone: FocusZone) => {
  const { store } = useFocusParts()
  return useSyncExternalStore(store.subscribe, () => store.filled(zone))
}

/**
 * Adds actions to the focus page's bar, by name while there is room when each says `inBar`, else in its "..." menu. A
 * `FocusAction` is an action rail's, so a link stays a real link through its `render`.
 */
export const FocusActions = ({ actions }: { actions: FocusAction[] }) => {
  const { store } = useFocusParts()
  const id = useId()
  useLayoutEffect(() => store.setActions(id, actions))
  useEffect(() => () => store.setActions(id, undefined), [store, id])
  return null
}

const tones: Record<NoticeLevel, string> = {
  refused: 'bg-danger-soft',
  conflict: 'bg-warning-soft',
  draft: 'bg-surface',
  info: 'bg-surface',
}

export type FocusNoticeProps = {
  /** One notice shows at a time, in this order: `refused`, `conflict`, `draft`, `info`; the next returns as one clears. */
  level: NoticeLevel
  /** The notice's buttons, at its end. */
  actions?: ReactNode
  children: ReactNode
}

/** A strip under the bar that pushes the surface down rather than covering it. */
export const FocusNotice = ({ level, actions, children }: FocusNoticeProps) => {
  const { store, hosts } = useFocusParts()
  const id = useId()
  useLayoutEffect(() => {
    store.setNotice(id, level)
    return () => store.setNotice(id, undefined)
  }, [store, id, level])
  const shown = useSyncExternalStore(store.subscribe, store.notice) === id
  const host = hosts.notice
  if (!shown || !host) return null
  const urgent = level === 'refused' || level === 'conflict'
  return createPortal(
    <div role={urgent ? 'alert' : 'status'} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 text-body', tones[level])}>
      <div className="min-w-0 flex-1 basis-48">{children}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>,
    host,
  )
}

export type FocusPanelProps = {
  /** Which side of the surface it takes: `end`, the default, or `start`. */
  side?: 'start' | 'end'
  title: string
  icon?: ReactNode
  status?: ReactNode
  /** Closes it, by the X or Escape. */
  onClose: () => void
  /** Pinned under the content, such as the button that goes with a form. */
  footer?: ReactNode
  /**
   * Takes the keyboard as it opens and hands it back as it closes, for a panel a button opened. A panel that opens with
   * a selection leaves focus where it is, so moving through what is selected does not jump into a form.
   */
  takesFocus?: boolean
  children: ReactNode
}

/**
 * A panel beside the surface, which narrows to make room, or lies over its edge when too little would be left. Below
 * `md` it covers the screen. Its content scrolls in a box of its own, since the page does not scroll.
 */
export const FocusPanel = ({ side = 'end', title, icon, status, onClose, footer, takesFocus = false, children }: FocusPanelProps) => {
  const { hosts, store } = useFocusParts()
  const host = hosts[side]
  const id = useId()
  // The page counts the panels open, so two narrow the surface no more than it can take
  useLayoutEffect(() => store.openPanel(id, side), [store, id, side])
  const body = useRef<HTMLDivElement>(null)
  // What had the keyboard as the panel opened, before anything inside takes it
  const [opener] = useState(() => document.activeElement)
  const drawn = Boolean(host)
  useEffect(() => {
    if (!takesFocus || !drawn) return
    // Something inside that took the keyboard first, such as a search box, keeps it
    if (!body.current?.contains(document.activeElement)) body.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [takesFocus, drawn, opener])
  if (!host) return null
  return createPortal(
    <SidePanel title={title} icon={icon} status={status} onClose={onClose} footer={footer}>
      <div
        ref={body}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto p-4 outline-none"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onClose()
        }}
      >
        {children}
      </div>
    </SidePanel>,
    host,
  )
}
