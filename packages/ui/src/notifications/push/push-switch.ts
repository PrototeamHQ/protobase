import { pushFailure, type PushFailure } from './push-failure'
import type { PushNotifications } from './push-notifications'
import type { PushState } from './web-push'

/** What turning push on or off changes for a button: its state, why it failed, and whether it is under way. */
export type PushSwitchUpdate = { state?: PushState; failure?: PushFailure | undefined; busy?: boolean }

/**
 * Turning push on and off from a button, telling `update` each change: busy from the start until it is over, however
 * it ends, and why it failed, which also goes to the console. Turning off is the user's choice, and push's state is
 * read again after it.
 */
export const pushSwitch = (push: Pick<PushNotifications, 'state' | 'turnOn' | 'turnOff'>, update: (change: PushSwitchUpdate) => void) => ({
  turnOn: async () => {
    update({ failure: undefined, busy: true })
    try {
      update({ state: await push.turnOn() })
    } catch (error) {
      console.error('Notifications could not be turned on:', error)
      update({ failure: pushFailure(error) })
    } finally {
      update({ busy: false })
    }
  },
  turnOff: async () => {
    update({ failure: undefined, busy: true })
    try {
      await push.turnOff({ chosen: true })
    } catch (error) {
      console.error('Notifications could not be turned off for good:', error)
      update({ failure: pushFailure(error) })
    }
    try {
      update({ state: await push.state() })
    } catch (error) {
      console.error('Whether notifications are on could not be read:', error)
    } finally {
      update({ busy: false })
    }
  },
})
