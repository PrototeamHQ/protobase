import { createContext, useContext } from 'react'
import type { createLiveUpdater } from './live-updater'

export type LiveUpdater = ReturnType<typeof createLiveUpdater>

/** The app's live updater, `undefined` in a browser and in a binary without it. */
export const LiveUpdaterContext = createContext<LiveUpdater | undefined>(undefined)

export const useLiveUpdater = () => useContext(LiveUpdaterContext)
