import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth-provider'
import type { PushState } from './web-push'

/**
 * Push in this browser for the signed-in user, for a bell or an app's own button: `state` is `loading` until known,
 * then `unsupported` (hide the button: no Web Push here, such as a tab on iPhone and iPad, or the app has no VAPID key),
 * `off`, `on` or `blocked` (the user refused notifications in the browser's settings). Call `turnOn` straight from a
 * click: the browser asks for permission only then, and without a click by someone signed in as themselves nothing
 * happens. `turnOff` unsubscribes this browser and removes its device.
 */
export const usePushNotifications = () => {
  const { push, state: auth } = useAuth()
  const userId = auth.kind === 'signed-in' ? auth.user.id : undefined
  const [state, setState] = useState<PushState | 'loading'>('loading')

  useEffect(() => {
    let current = true
    void push.state().then((read) => current && setState(read))
    return () => {
      current = false
    }
  }, [push, userId])

  const turnOn = useCallback(async () => setState(await push.turnOn()), [push])
  const turnOff = useCallback(async () => {
    await push.turnOff()
    setState(await push.state())
  }, [push])

  return { state, turnOn, turnOff }
}
