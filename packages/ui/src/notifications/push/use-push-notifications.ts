import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth-provider'
import type { PushState } from './web-push'
import { watchNotificationPermission } from './watch-permission'

/**
 * Push in this browser for the signed-in user, for a bell or an app's own button: `state` is `loading` until known,
 * then `unsupported` (hide the button: no Web Push here, such as a tab on iPhone and iPad, or the app has no VAPID key),
 * `off`, `on` or `blocked` (the user refused notifications in the browser's settings). Call `turnOn` straight from a
 * click: the browser asks for permission only then, and without a click by someone signed in as themselves nothing
 * happens. `turnOff` unsubscribes this browser and removes its device. `state` is read again on a return to the page
 * and when the browser says the permission changed.
 */
export const usePushNotifications = () => {
  const { push, state: auth } = useAuth()
  const userId = auth.kind === 'signed-in' ? auth.user.id : undefined
  const [state, setState] = useState<PushState | 'loading'>('loading')

  // Read again whenever the permission may have changed, so `blocked` turns back into `off` once the user allows it.
  useEffect(() => {
    let current = true
    const read = () => void push.state().then((next) => current && setState(next))
    read()
    const stop = typeof window === 'undefined' ? undefined : watchNotificationPermission(read)
    return () => {
      current = false
      stop?.()
    }
  }, [push, userId])

  const turnOn = useCallback(async () => setState(await push.turnOn()), [push])
  const turnOff = useCallback(async () => {
    await push.turnOff()
    setState(await push.state())
  }, [push])

  return { state, turnOn, turnOff }
}
