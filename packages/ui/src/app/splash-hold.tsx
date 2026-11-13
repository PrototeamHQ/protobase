import { createContext, useContext, useEffect, type ReactNode } from 'react'

/** Keeps the launch splash up while a loading screen draws, and hides it once, when none does. */
export type SplashHold = {
  /** Holds the splash until the returned function releases it. */
  hold: () => () => void
  /** Marks the app as drawn: the splash hides as soon as nothing holds it. */
  start: () => void
}

/**
 * The hold on the launch splash: `hide` runs once, after `start`, as soon as no loading screen holds it. A screen that
 * replaces another in the same render holds it before the check, since the check waits for the end of that render's
 * effects, so the splash stays up from the auth check through `/meta` to the plugins without a gap.
 */
export const createSplashHold = (hide: () => void): SplashHold => {
  let holds = 0
  let started = false
  let hidden = false
  const settle = () =>
    queueMicrotask(() => {
      if (!started || hidden || holds > 0) return
      hidden = true
      hide()
    })
  return {
    hold: () => {
      holds += 1
      let released = false
      return () => {
        if (released) return
        released = true
        holds -= 1
        settle()
      }
    },
    start: () => {
      started = true
      settle()
    },
  }
}

const SplashHoldContext = createContext<SplashHold | undefined>(undefined)

export const SplashHoldProvider = ({ value, children }: { value: SplashHold; children: ReactNode }) => <SplashHoldContext.Provider value={value}>{children}</SplashHoldContext.Provider>

/** Drawn by a loading screen: holds the launch splash while it shows. Nothing outside a `SplashHoldProvider`. */
export const HoldSplash = () => {
  const splash = useContext(SplashHoldContext)
  useEffect(() => splash?.hold(), [splash])
  return null
}
