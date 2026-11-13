import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/auth-provider'
import type { PushFailure } from './push-failure'
import { pushSwitch } from './push-switch'
import type { PushState } from './web-push'
import { watchNotificationPermission } from './watch-permission'

/**
 * Push in this browser, or the Android app, for the signed-in user, for a bell or an app's own button: `state` is
 * `loading` until known, then `unsupported` (hide the button: no Web Push here, such as a tab on iPhone and iPad, the
 * app has no VAPID key, or the Android app was built without google-services.json),
 * `off`, `on` or `blocked` (the user refused notifications in the browser's settings). Call `turnOn` straight from a
 * click: the browser asks for permission only then, and without a click by someone signed in as themselves nothing
 * happens. `busy` is true while either is under way, and `failure` says why the last `turnOn` or `turnOff` failed,
 * which also goes to the console, until the next one. `turnOff` unsubscribes this browser and removes its device, and the app does not
 * turn push on again by itself. `state` is read again on a return to the page, when the browser says the permission
 * changed, and on `refresh`, such as when the bell opens after the app registered push by itself.
 */
export const usePushNotifications = () => {
  const { push, state: auth } = useAuth()
  const userId = auth.kind === 'signed-in' ? auth.user.id : undefined
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [failure, setFailure] = useState<PushFailure>()
  const [busy, setBusy] = useState(false)

  // Read again whenever the permission may have changed, so `blocked` turns back into `off` once the user allows it.
  const [reads, setReads] = useState(0)
  useEffect(() => {
    let current = true
    const read = () => void push.state().then((next) => current && setState(next))
    read()
    const stop = typeof window === 'undefined' ? undefined : watchNotificationPermission(read)
    return () => {
      current = false
      stop?.()
    }
  }, [push, userId, reads])
  const refresh = useCallback(() => setReads((count) => count + 1), [])

  const { turnOn, turnOff } = useMemo(
    () =>
      pushSwitch(push, (change) => {
        if (change.state) setState(change.state)
        if ('failure' in change) setFailure(change.failure)
        if (change.busy !== undefined) setBusy(change.busy)
      }),
    [push],
  )

  return { state, busy, failure, turnOn, turnOff, refresh }
}
