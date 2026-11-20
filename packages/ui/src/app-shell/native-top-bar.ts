import { createContext, useContext } from 'react'
import type { NativeBridge } from '../app/native-auth-fetch'

/** The plugin that draws the phone top bar as the system navigation bar (@protobase/mobile's ProtobaseTopBar). */
export const nativeTopBarPlugin = 'ProtobaseTopBar'

/** The account's entry as the native bar takes it: the label it is read by, and the avatar's initials, empty for the guest icon. */
export type NativeAccount = { label: string; text: string }

/**
 * The web bar's colours as `#rrggbbaa`, which the native bar takes so it looks the same: its background, its text and
 * icons, and the avatar's circle and initials; `null` for the system's own.
 */
export type NativeTopBarColors = { background: string | null; foreground: string | null; avatar: string | null; avatarText: string | null }

/** One of the app's actions in the bar, such as a page's menu of more actions: the label it is read by, and its icon as a PNG data URL. */
export type NativeTopBarAction = { label: string; icon: string | null }

/**
 * The bar the shell wants: none, or the page's title, the label of the page the way back goes to, the menu's and search's
 * buttons, the app's actions left of the account, the account and the colours.
 */
export type NativeTopBarState =
  | { visible: false }
  | { visible: true; title: string; back: string | null; menu: boolean; search: boolean; actions: NativeTopBarAction[]; account: NativeAccount | null; colors: NativeTopBarColors }

/** A tap on one of the native bar's controls, which the shell answers as a tap on its own. */
export type NativeTopBarControl = 'back' | 'menu' | 'search' | 'account'

export const nativeTopBarControls: NativeTopBarControl[] = ['back', 'menu', 'search', 'account']

export type NativeTopBar = {
  /** Asks for `state`, the whole of it each time; resolves with the bar's height while it shows. */
  set: (state: NativeTopBarState) => Promise<{ height?: number }>
  /** Calls `tap` with each control tapped; returns what stops it. */
  onTap: (tap: (control: NativeTopBarControl) => void) => () => void
  /** Calls `tap` with the place in `actions` of each action tapped; returns what stops it. */
  onAction: (tap: (index: number) => void) => () => void
  /** Calls `told` with the bar's height in CSS pixels, the status bar included, whenever it changes. */
  onHeight: (told: (height: number) => void) => () => void
}

// The height `data` holds, when the event's data is an object holding one
const heightIn = (data: unknown) => {
  const value = typeof data === 'object' && data !== null ? (data as { height?: unknown }).height : undefined
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** The native top bar of the app the page runs in, when its bridge offers the plugin; `undefined` otherwise. */
export const nativeTopBar = (bridge: NativeBridge | undefined): NativeTopBar | undefined => {
  if (!bridge?.isPluginAvailable(nativeTopBarPlugin)) return
  return {
    set: async (state) => {
      const height = heightIn(await bridge.nativePromise(nativeTopBarPlugin, 'set', state))
      return height === undefined ? {} : { height }
    },
    onTap: (tap) => {
      const listeners = nativeTopBarControls.map((control) => bridge.addListener(nativeTopBarPlugin, control, () => tap(control)))
      return () => listeners.forEach((listener) => void listener.remove())
    },
    onAction: (tap) => {
      const listener = bridge.addListener(nativeTopBarPlugin, 'action', (data) => {
        const index = typeof data === 'object' && data !== null ? (data as { index?: unknown }).index : undefined
        if (typeof index === 'number' && Number.isInteger(index) && index >= 0) tap(index)
      })
      return () => void listener.remove()
    },
    onHeight: (told) => {
      const listener = bridge.addListener(nativeTopBarPlugin, 'height', (data) => {
        const height = heightIn(data)
        if (height !== undefined) told(height)
      })
      return () => void listener.remove()
    },
  }
}

/** The app's native top bar (`nativeTopBar`), which the phone top bar draws itself with when there is one. */
export const NativeTopBarContext = createContext<NativeTopBar | undefined>(undefined)

export const useNativeTopBar = () => useContext(NativeTopBarContext)
