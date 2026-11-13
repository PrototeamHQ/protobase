import { protobaseVersion } from '../../plugins/plugin-api'
import { loadStartCache } from './start-cache'
import { indexedDbStartCacheStore } from './start-cache-store'

/**
 * The page's start cache in IndexedDB, for this shell's Protobase version. A browser that keeps no IndexedDB, or refuses
 * to open it, such as some private windows, starts without one.
 */
export const openStartCache = async () => {
  if (typeof indexedDB === 'undefined') return
  try {
    return await loadStartCache(indexedDbStartCacheStore(), protobaseVersion)
  } catch (error) {
    if (error instanceof DOMException) return
    throw error
  }
}
