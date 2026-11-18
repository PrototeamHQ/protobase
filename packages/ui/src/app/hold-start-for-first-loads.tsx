import { useIsFetching, useQueryClient, type Query } from '@tanstack/react-query'
import { useContext, useEffect, useRef, useState } from 'react'
import { SplashHoldContext } from './splash-hold'
import { startsFromSnapshot } from './start-screen'

/** How long the start screen waits at most for the first page's first data when it shows a host's snapshot. */
export const firstLoadsWaitMs = 4000

// A query on screen that has no answer yet, as RevealWhenLoaded waits for
const firstLoad = { type: 'active' as const, predicate: (query: Query) => query.state.data === undefined }

/**
 * With a host's snapshot on the start screen (`startsFromSnapshot`), keeps the start screen up past the loading screens
 * until the first page has its first data too, at most `firstLoadsWaitMs`, so the snapshot gives way once, to the page
 * as it stays, with no skeleton between them. Without a snapshot it holds nothing, and the start is as before. Drawn
 * with the first page, in the render that takes the last loading screen away, so it holds before the start screen
 * would go.
 */
export const HoldStartForFirstLoads = () => {
  const splash = useContext(SplashHoldContext)
  const client = useQueryClient()
  const fetching = useIsFetching(firstLoad)
  const [snapshot] = useState(() => typeof document !== 'undefined' && startsFromSnapshot(document))
  const release = useRef<() => void>(undefined)

  useEffect(() => {
    if (!splash || !snapshot) return
    const letGo = splash.hold()
    release.current = letGo
    const latest = setTimeout(letGo, firstLoadsWaitMs)
    return () => {
      clearTimeout(latest)
      letGo()
    }
  }, [splash, snapshot])

  // The count the hook gives lags the queries the page's parts start as they mount, so the live count decides
  useEffect(() => {
    if (fetching > 0) return
    const settled = setTimeout(() => client.isFetching(firstLoad) === 0 && release.current?.(), 0)
    return () => clearTimeout(settled)
  }, [fetching, client])

  return null
}
