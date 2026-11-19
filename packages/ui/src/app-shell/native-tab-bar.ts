import { createContext, useContext } from 'react'
import type { NativeBridge } from '../app/native-auth-fetch'

/** The plugin that draws the mobile bottom bar as the system tab bar (@protobase/mobile's ProtobaseTabBar). */
export const nativeTabBarPlugin = 'ProtobaseTabBar'

/**
 * A tab as the native bar takes it: its label and its icon as a PNG data URL at 3x, `null` without one; `search` for the
 * search tab, which the native bar draws as its own search.
 */
export type NativeTab = { label: string; icon: string | null; search?: true }

/** The bar the shell wants: none, or its tabs and the current one (`null` for none). */
export type NativeTabBarState = { visible: false } | { visible: true; tabs: NativeTab[]; selected: number | null }

export type NativeTabBar = {
  /** Asks for `state`, the whole of it each time, so the bar always shows what the shell last wanted. */
  set: (state: NativeTabBarState) => Promise<unknown>
  /** Calls `tap` with the index of each tab tapped; returns what stops it. */
  onTap: (tap: (index: number) => void) => () => void
  /** Calls `told` with the bar's height in CSS pixels, the home indicator's inset included, whenever it changes. */
  onHeight: (told: (height: number) => void) => () => void
}

// The number `data[field]` holds, when the event's data is an object holding one
const numberIn = (data: unknown, field: string) => {
  const value = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[field] : undefined
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The native tab bar of the app the page runs in, when its bridge offers the plugin; `undefined` otherwise. */
export const nativeTabBar = (bridge: NativeBridge | undefined): NativeTabBar | undefined => {
  if (!bridge?.isPluginAvailable(nativeTabBarPlugin)) return
  const listen = (event: string, field: string, accept: (value: number) => boolean, hand: (value: number) => void) => {
    const listener = bridge.addListener(nativeTabBarPlugin, event, (data) => {
      const value = numberIn(data, field)
      if (value !== undefined && accept(value)) hand(value)
    })
    return () => void listener.remove()
  }
  return {
    set: (state) => bridge.nativePromise(nativeTabBarPlugin, 'set', state),
    onTap: (tap) => listen('tap', 'index', Number.isInteger, tap),
    onHeight: (told) => listen('height', 'height', (height) => height >= 0, told),
  }
}

/**
 * The bar's state for tabs labelled `labels`, with `icons` in the same order, the current one at `selected` and, when
 * there is one, search at `search`.
 */
export const nativeTabBarState = (labels: string[], icons: Array<string | null>, selected: number, search?: number): NativeTabBarState => ({
  visible: true,
  tabs: labels.map((label, index) => ({ label, icon: icons[index] ?? null, ...(index === search && { search: true as const }) })),
  selected: selected >= 0 && selected < labels.length ? selected : null,
})

/** The app's native tab bar (`nativeTabBar`), which the mobile bottom bar draws itself with when there is one. */
export const NativeTabBarContext = createContext<NativeTabBar | undefined>(undefined)

export const useNativeTabBar = () => useContext(NativeTabBarContext)
