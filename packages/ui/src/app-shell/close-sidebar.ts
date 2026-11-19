import { useEffect } from 'react'

/**
 * The event a host or a plugin dispatches on `window` to close the shell's sidebar where it is a drawer over the page,
 * on a phone: for example Protobase's official app, as it opens its own switcher on a tap on the logo
 * (`logoTapEvent`). Where the sidebar sits beside the page it does nothing.
 */
export const closeSidebarEvent = 'protobase:close-sidebar'

/** Calls `close` on `closeSidebarEvent`. */
export const useCloseSidebarEvent = (close: () => void) => {
  useEffect(() => {
    window.addEventListener(closeSidebarEvent, close)
    return () => window.removeEventListener(closeSidebarEvent, close)
  }, [close])
}
