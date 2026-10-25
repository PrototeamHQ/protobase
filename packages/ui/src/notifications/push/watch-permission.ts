/**
 * Calls `onChange` whenever the page's notification permission may have changed until the returned function is called:
 * the Permissions API's change event, as when the user allows notifications from the address bar, and a return to the
 * page, as from the browser's or the phone's settings, which also covers a browser whose Permissions API does not know
 * notifications.
 */
export const watchNotificationPermission = (onChange: () => void, win: Window & typeof globalThis = window) => {
  let status: PermissionStatus | undefined
  let stopped = false
  const visible = () => {
    if (win.document.visibilityState === 'visible') onChange()
  }
  win.addEventListener('focus', onChange)
  win.document.addEventListener('visibilitychange', visible)
  if ('permissions' in win.navigator) {
    win.navigator.permissions.query({ name: 'notifications' }).then(
      (answer) => {
        if (stopped) return
        status = answer
        answer.addEventListener('change', onChange)
      },
      // A browser that does not know the permission's name refuses it with a TypeError; the return to the page covers it
      (error: unknown) => {
        if (!(error instanceof TypeError)) throw error
      },
    )
  }
  return () => {
    stopped = true
    win.removeEventListener('focus', onChange)
    win.document.removeEventListener('visibilitychange', visible)
    status?.removeEventListener('change', onChange)
  }
}
