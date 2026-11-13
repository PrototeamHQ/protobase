import { useEffect } from 'react'
import { useRouter } from '../router'
import { sessionPageKeeper } from './kept-page'
import { useLiveUpdater } from './live-update-context'
import { createResumeUpdate } from './resume-update'

/**
 * Each time the app goes to the background and comes back, `createResumeUpdate`: a reload into a downloaded release
 * after a while away, otherwise a check for one. The session lives in the native app, so the reload keeps it.
 */
export const LiveUpdateResume = () => {
  const updater = useLiveUpdater()
  const { holdsChanges } = useRouter()

  useEffect(() => {
    if (!updater) return
    const resume = createResumeUpdate({ updater, holdsChanges, page: sessionPageKeeper() })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return resume.leave()
      void resume.back()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [updater, holdsChanges])

  return null
}
