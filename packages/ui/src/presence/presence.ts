import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

/**
 * Whether someone has a page of the app open and in use, `away` when open but idle, by the app's own rule; `offline`
 * once the app's realtime relay says they have none open.
 */
export type Presence = 'online' | 'away' | 'offline'

/**
 * The app's presence, by user id, as `presence` in `protobase.ui.tsx` gives it: a React hook, called once while the app
 * shows, so it may use the app's own channels and live updates. Someone it leaves out has no page open, and shows no
 * presence; returning undefined, as while it loads, shows none.
 */
export type PresenceHook = () => PresenceByUser | undefined

/** Presence by user id. */
export type PresenceByUser = Readonly<Record<string, Presence>>

const combined = (app: PresenceByUser | undefined, relay: PresenceByUser | undefined) => (app && relay ? { ...relay, ...app } : (app ?? relay))

/**
 * Holds the latest presence, so the places that show it read it without calling the app's hook again: the hook's
 * (`set`) over the relay's (`heard`). It also keeps who the page shows (`show`), whose presence the relay's is read for.
 */
export const createPresenceStore = () => {
  let app: PresenceByUser | undefined
  let relay: PresenceByUser | undefined
  let latest: PresenceByUser | undefined
  const listeners = new Set<() => void>()
  const shown = new Map<string, number>()
  const shownListeners = new Set<() => void>()

  const update = () => {
    const next = combined(app, relay)
    if (next === latest) return
    latest = next
    for (const listener of listeners) listener()
  }

  return {
    get: () => latest,
    set: (presence: PresenceByUser | undefined) => {
      app = presence
      update()
    },
    /** The relay's presence, as `followPresence` reads and hears it. */
    heard: (presence: PresenceByUser | undefined) => {
      relay = presence
      update()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Says the page shows these people, such as a members list, until the returned function is called. */
    show: (people: readonly string[]) => {
      const added = people.filter((person) => !shown.has(person))
      for (const person of people) shown.set(person, (shown.get(person) ?? 0) + 1)
      if (added.length > 0) for (const listener of [...shownListeners]) listener()
      return () => {
        for (const person of people) {
          const left = (shown.get(person) ?? 1) - 1
          if (left > 0) shown.set(person, left)
          else shown.delete(person)
        }
      }
    },
    /** The people the page shows now. */
    shown: () => [...shown.keys()],
    /** Hears each time the page starts to show someone it did not. */
    onShown: (listener: () => void) => {
      shownListeners.add(listener)
      return () => void shownListeners.delete(listener)
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

/** Says the page shows these people's presence while it is drawn, so the relay's presence is read for them. */
export const useShownPeople = (people: readonly string[]) => {
  const store = useContext(PresenceContext)
  const listed = [...new Set(people)].sort().join('\n')
  useEffect(() => {
    if (!store || listed === '') return
    return store.show(listed.split('\n'))
  }, [store, listed])
}

/** One person's presence, from presence by user id: nothing for someone it leaves out. */
export const presenceOf = (presence: PresenceByUser | undefined, userId: string): Presence | undefined =>
  presence && Object.hasOwn(presence, userId) ? presence[userId] : undefined
