import type { RailAction } from '../record-view/action-rail'
import { noticeOrder, type NoticeLevel } from './notice-order'

/** An action of the bar: shown by name while there is room when `inBar`, else in the "..." menu. */
export type FocusAction = RailAction & { inBar?: boolean }

export type FocusZone = 'mode' | 'controls' | 'state' | 'secondary' | 'primary'

/**
 * What the parts inside a focus page tell its bar without rendering their owners again: the actions each part offers,
 * the notices that want the strip, and how many parts fill each zone. Whatever draws the surface owns its state, so this
 * travels upward; its value comes back through `useSyncExternalStore`, so a part's new render never loops.
 */
export const createFocusStore = () => {
  const actions = new Map<string, FocusAction[]>()
  const notices = new Map<string, NoticeLevel>()
  const filled = new Map<FocusZone, number>()
  const listeners = new Set<() => void>()
  let shownActions: FocusAction[] = []
  let shownNotice: string | undefined
  const changed = () => {
    shownActions = [...actions.values()].flat()
    shownNotice = [...notices].sort(([, a], [, b]) => noticeOrder(a) - noticeOrder(b))[0]?.[0]
    for (const listener of listeners) listener()
  }
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    actions: () => shownActions,
    notice: () => shownNotice,
    filled: (zone: FocusZone) => (filled.get(zone) ?? 0) > 0,
    setActions: (id: string, next: FocusAction[] | undefined) => {
      if (next) actions.set(id, next)
      else actions.delete(id)
      changed()
    },
    setNotice: (id: string, level: NoticeLevel | undefined) => {
      if (level) notices.set(id, level)
      else notices.delete(id)
      changed()
    },
    fill: (zone: FocusZone) => {
      filled.set(zone, (filled.get(zone) ?? 0) + 1)
      changed()
      return () => {
        filled.set(zone, (filled.get(zone) ?? 1) - 1)
        changed()
      }
    },
  }
}

export type FocusStore = ReturnType<typeof createFocusStore>
