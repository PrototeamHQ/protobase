import { createContext, useContext, useSyncExternalStore } from 'react'

/** Whether someone has a page of the app open and in use, `away` when open but idle; by the app's own rule. */
export type Presence = 'online' | 'away'

/**
 * The app's presence, by user id, as `presence` in `protobase.ui.tsx` gives it: a React hook, called once while the app
 * shows, so it may use the app's own channels and live updates. Someone it leaves out has no page open, and shows no
 * presence; returning undefined, as while it loads, shows none.
 */
export type PresenceHook = () => PresenceByUser | undefined

/** Presence by user id. */
export type PresenceByUser = Readonly<Record<string, Presence>>

/** Holds the latest presence the app's hook gave, so the places that show it read it without calling the hook again. */
export const createPresenceStore = () => {
  let latest: PresenceByUser | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => latest,
    set: (presence: PresenceByUser | undefined) => {
      if (presence === latest) return
      latest = presence
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

export type PresenceStore = ReturnType<typeof createPresenceStore>

export const PresenceContext = createContext<PresenceStore | undefined>(undefined)

const nobody = () => () => {}
const none = () => undefined

/** The app's presence by user id, undefined in an app that gives none (see `PresenceProvider`). */
export const usePresence = () => {
  const store = useContext(PresenceContext)
  return useSyncExternalStore(store?.subscribe ?? nobody, store?.get ?? none, store?.get ?? none)
}

/** One person's presence, from presence by user id: nothing for someone it leaves out. */
export const presenceOf = (presence: PresenceByUser | undefined, userId: string): Presence | undefined =>
  presence && Object.hasOwn(presence, userId) ? presence[userId] : undefined
