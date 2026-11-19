import { createContext, useContext, useEffect } from 'react'
import type { NativeBridge } from '../app/native-auth-fetch'

/**
 * What a swipe from the left edge does: goes `back` a page, with the page sliding under the finger as on iOS; opens the
 * `sidebar` drawer, which follows the finger; or `none`, which leaves the edge to whatever is around the page, such as
 * a host app's own switcher.
 */
export type EdgeSwipeAction = 'back' | 'sidebar' | 'none'

/**
 * The one place the edge swipe is decided, on a phone: back where the trail has a step back, the sidebar where there is
 * neither a step back nor a bottom bar and the drawer is closed, and nothing otherwise, as on a tab's page in More page
 * mode or with the drawer open. A desktop has no edge swipe.
 */
export const edgeSwipeAction = ({ desktop, back, bottomBar, drawerOpen }: { desktop: boolean; back: boolean; bottomBar: boolean; drawerOpen: boolean }): EdgeSwipeAction =>
  desktop ? 'none' : back ? 'back' : !bottomBar && !drawerOpen ? 'sidebar' : 'none'

/** The native plugin a host app offers to learn the page's edge swipe ahead of each gesture, as its own uses the edge. */
export const edgeSwipePlugin = 'ProtobaseEdgeSwipe'

/**
 * What the host app is told: `back` is its own back swipe, which shows the entry behind from its snapshot, so only
 * where that entry is the trail's step back; `sidebar` and `page` the page does itself, the drawer or its own way back;
 * `none` leaves the edge to the app.
 */
export type DeclaredEdgeSwipe = 'back' | 'sidebar' | 'page' | 'none'

/** The edge swipe the host app is told, where it does the back swipe itself (`nativeBack`) and what history has behind. */
export const declaredEdgeSwipe = (action: EdgeSwipeAction, { nativeBack, behindIsBack }: { nativeBack: boolean; behindIsBack: boolean }): DeclaredEdgeSwipe =>
  action !== 'back' ? action : nativeBack && behindIsBack ? 'back' : 'page'

export type NativeEdgeSwipe = { set: (action: DeclaredEdgeSwipe) => Promise<unknown> }

/** The host app's edge swipe plugin, when its bridge offers one; `undefined` otherwise. */
export const nativeEdgeSwipe = (bridge: NativeBridge | undefined): NativeEdgeSwipe | undefined => {
  if (!bridge?.isPluginAvailable(edgeSwipePlugin)) return
  return { set: (action) => bridge.nativePromise(edgeSwipePlugin, 'set', { action }) }
}

export const NativeEdgeSwipeContext = createContext<NativeEdgeSwipe | undefined>(undefined)

/**
 * Whether the host app can do the back swipe itself, as the iOS app does with the web view's own, which shows the page
 * behind; the shell then draws none where the entry behind is the trail's step back (`declaredEdgeSwipe`).
 */
export const useNativeBackSwipe = () => Boolean(useContext(NativeEdgeSwipeContext))

/**
 * Tells the host app the page's edge swipe as desired state, again on every navigation (`at`) and change, so the app
 * knows at a gesture's start whether the edge is the page's, with no round trip.
 */
export const useDeclaredEdgeSwipe = (action: DeclaredEdgeSwipe, at: string) => {
  const native = useContext(NativeEdgeSwipeContext)
  useEffect(() => {
    void native?.set(action).catch(() => undefined)
  }, [native, action, at])
}
