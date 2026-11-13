import { createContext, useContext } from 'react'
import type { DehydratedState } from '@tanstack/react-query'
import type { AuthUser, SetupStatus } from '@protobase/client'
import type { SeenPage } from './seen-pages'
import type { StartCacheStore } from './start-cache-store'

/** Who was signed in, as themselves, and the server's setup status then: what the auth state starts from next time. */
export type CachedSession = { user: AuthUser; status: SetupStatus }

/** The queries last saved for one cache owner (see `cacheOwner`), with the pages they were seen on. */
export type CachedQueries = { owner: string; pages: SeenPage[]; state: DehydratedState }

/**
 * What the app starts from before the network answers, kept from sign-in on with no time limit: the signed-in
 * session and that person's queries. It holds one person at a time, and only for the shell version (`buster`) that
 * wrote it.
 */
export type StartCache = {
  session: () => CachedSession | undefined
  /** The saved queries when they are `owner`'s; nobody else's are ever given out. */
  queries: (owner: string) => CachedQueries | undefined
  saveSession: (session: CachedSession) => Promise<void>
  saveQueries: (queries: CachedQueries) => Promise<void>
  /** Forgets everything, as signing out and a 401 do. */
  clear: () => Promise<void>
}

type Stored<T> = { buster: string; value: T }

const sessionKey = 'session'
const queriesKey = 'queries'

const ownerOf = (session: CachedSession) => `user:${session.user.id}`

/**
 * Reads the start cache from `store`. A record another shell version wrote is removed, so new code never reads an old
 * shape; so are queries without the session of their owner.
 */
export const loadStartCache = async (store: StartCacheStore, buster: string): Promise<StartCache> => {
  const [storedSession, storedQueries] = (await Promise.all([store.read(sessionKey), store.read(queriesKey)])) as [Stored<CachedSession> | undefined, Stored<CachedQueries> | undefined]
  let session = storedSession?.buster === buster ? storedSession.value : undefined
  let queries = storedQueries?.buster === buster && session && storedQueries.value.owner === ownerOf(session) ? storedQueries.value : undefined
  const stale = [...(storedSession && !session ? [sessionKey] : []), ...(storedQueries && !queries ? [queriesKey] : [])]
  if (stale.length > 0) await store.remove(stale)
  return {
    session: () => session,
    queries: (owner) => (queries?.owner === owner ? queries : undefined),
    saveSession: (next) => {
      if (queries && queries.owner !== ownerOf(next)) queries = undefined
      session = next
      return store.write(sessionKey, { buster, value: next } satisfies Stored<CachedSession>)
    },
    saveQueries: (next) => {
      queries = next
      return store.write(queriesKey, { buster, value: next } satisfies Stored<CachedQueries>)
    },
    clear: () => {
      session = undefined
      queries = undefined
      return store.remove([sessionKey, queriesKey])
    },
  }
}

const StartCacheContext = createContext<StartCache | undefined>(undefined)

/** Gives the app below it the start cache; without one nothing is kept between starts. */
export const StartCacheProvider = StartCacheContext.Provider

export const useStartCache = () => useContext(StartCacheContext)
