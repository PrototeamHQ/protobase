import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Notice } from '../meta-gate'
import type { NativeBridge } from '../native-auth-fetch'
import { appLiveUpdater } from './app-live-updater'
import { text } from './messages'

export type LiveUpdateGateProps = { nativeBridge: NativeBridge | undefined; apiOrigin: string | undefined; children: ReactNode }

/**
 * The live updater in the iOS or Android app, around everything the shell draws. Once the shell has drawn, it tells
 * the plugin the files started, so a release that fails before then goes back to the app's own; then it checks for a
 * release, at launch and each time the app comes back to the foreground, in the background. Only a required release
 * at launch holds the app, with a notice, until it reloads into it or goes on without it.
 */
export const LiveUpdateGate = ({ nativeBridge, apiOrigin, children }: LiveUpdateGateProps) => {
  const [holding, setHolding] = useState(false)
  const updater = useMemo(() => appLiveUpdater({ bridge: nativeBridge, apiOrigin, userAgent: navigator.userAgent, fetch: window.fetch.bind(window), onHold: setHolding }), [nativeBridge, apiOrigin])

  useEffect(() => {
    if (!updater) return
    void updater.ready()
    void updater.check(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void updater.check(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [updater])

  if (holding) return <Notice title={text('holdTitle')}>{text('holdLine')}</Notice>
  return children
}
