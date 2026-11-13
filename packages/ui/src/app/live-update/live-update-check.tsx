import { useEffect } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { useAdminMeta } from '../meta-gate'
import { useLiveUpdater } from './live-update-context'
import { checkPeriodically } from './periodic-check'

/**
 * In the iOS or Android app, while someone is signed in, checks for a release in the background: once the app has
 * drawn, on an interval while it is in view (`checkPeriodically`), and at once when the server runs another Protobase
 * version than the page started with. A release is set next, for a cold start or a return after a while away; the app
 * shows no prompt to reload, which would only start the files it runs again.
 */
export const LiveUpdateCheck = () => {
  const updater = useLiveUpdater()
  const signedIn = useAuth().state.kind === 'signed-in'
  const changed = Boolean(useAdminMeta().versionChange)

  useEffect(() => {
    if (!updater || !signedIn) return
    return checkPeriodically(
      () => void updater.check(),
      () => document.visibilityState === 'visible',
    )
  }, [updater, signedIn, changed])

  return null
}
