import { showBootTrace } from './boot-trace'

/**
 * The event the app dispatches on `window` once it has drawn its first page, as it takes index.html's start screen
 * away, and the browser has painted that frame: the next animation frame, then a task after it. With a warm start cache
 * that is the first commit. A host that loads the app out of sight, such as Protobase's official app switching
 * workspaces, shows it then, so the page appears whole instead of blank.
 */
export const uiReadyEvent = 'protobase:ui-ready'

/** Dispatches `uiReadyEvent` on `page` once the frame drawn now has been painted. */
export const tellUiReady = (page: Pick<Window, 'requestAnimationFrame' | 'setTimeout' | 'dispatchEvent'> = window) =>
  void page.requestAnimationFrame(() =>
    page.setTimeout(() => {
      page.dispatchEvent(new Event(uiReadyEvent))
      // The boot up to createRoot, when the host asked for it (boot-trace.ts)
      showBootTrace()
    }, 0),
  )
