import { useEffect, type ReactNode } from 'react'
import { LiveUpdaterContext, type LiveUpdater } from './live-update-context'

export type LiveUpdateProviderProps = { updater: LiveUpdater | undefined; children: ReactNode }

/**
 * The live updater in the iOS or Android app (`appLiveUpdater`), around everything the shell draws. Once the shell has
 * drawn, it tells the plugin the files started, so a release that fails before then goes back to the app's own.
 * Nothing else runs at launch: the app starts on the release set next earlier, or its own files. `LiveUpdateCheck`,
 * `LiveUpdateResume` and a sign-in take releases later, and nothing of an update is ever shown.
 */
export const LiveUpdateProvider = ({ updater, children }: LiveUpdateProviderProps) => {
  useEffect(() => {
    if (!updater) return
    void updater.ready()
  }, [updater])

  return <LiveUpdaterContext.Provider value={updater}>{children}</LiveUpdaterContext.Provider>
}
