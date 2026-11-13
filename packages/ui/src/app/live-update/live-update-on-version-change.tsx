import { useEffect } from 'react'
import { useAdminMeta } from '../meta-gate'
import { useLiveUpdater } from './live-update-context'

/**
 * In the iOS or Android app, once the server runs another Protobase version than the page started with, checks for a
 * release in the background, so it is downloaded by the time the app comes back from a while away and reloads into it.
 * The app then shows no prompt to reload, which would only start the files it runs again.
 */
export const LiveUpdateOnVersionChange = () => {
  const updater = useLiveUpdater()
  const changed = Boolean(useAdminMeta().versionChange)
  useEffect(() => {
    if (updater && changed) void updater.check(false)
  }, [updater, changed])
  return null
}
