import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import type { NativeBridge } from '../native-auth-fetch'
import { swapDecision } from './swap-decision'

/** The native bridge the live updater calls, with the error type a plugin rejects with (`window.Capacitor.Exception`). */
export type LiveUpdateBridge = Pick<NativeBridge, 'nativePromise'> & { Exception: abstract new (...args: never[]) => Error }

export type LiveUpdaterInput = {
  bridge: LiveUpdateBridge
  /** The server's answer, `undefined` when it gave none (see `checkRelease`). */
  check: () => Promise<MobileReleaseAnswer | undefined>
  /** `<api origin>/api/mobile/releases`, which the guard takes a release from only. */
  releasesUrl: string
}

// The id a getCurrentBundle or getNextBundle answer names, null for the app's own files.
const bundleIdOf = (result: unknown) => {
  const id = typeof result === 'object' && result !== null ? (result as { bundleId?: unknown }).bundleId : undefined
  return typeof id === 'string' ? id : null
}

/**
 * The app's side of the live updater, through Protobase's guarded LiveUpdate plugin, which checks every release
 * itself. `ready()` tells the plugin the files the app runs started; `check()` asks the server and takes a new release
 * for the next cold start, one check at a time; `applyNext(beforeReload)` reloads into a release already taken, telling
 * whether it did. None of it shows anything: a release the guard refuses, or a call that fails, leaves the app on the
 * files it runs.
 */
export const createLiveUpdater = ({ bridge, check, releasesUrl }: LiveUpdaterInput) => {
  const call = (method: string, options: object = {}) => bridge.nativePromise('LiveUpdate', method, options)
  const refused = (error: unknown) => error instanceof bridge.Exception

  const take = async (bundleId: string) => {
    await call('downloadBundle', { bundleId, url: `${releasesUrl}/${bundleId}`, artifactType: 'manifest' })
    await call('setNextBundle', { bundleId })
  }

  const run = async () => {
    const [answer, current, next] = await Promise.all([check(), call('getCurrentBundle'), call('getNextBundle')])
    const swap = swapDecision({ answer, current: bundleIdOf(current), next: bundleIdOf(next) })
    if (swap.kind === 'none') return
    try {
      await take(swap.bundleId)
    } catch (error) {
      if (!refused(error)) throw error
    }
  }

  // The plugin's reload runs the next bundle under the same rollback as a cold start: the release must call ready().
  const applyNext = async (beforeReload: () => void) => {
    const [current, next] = await Promise.all([call('getCurrentBundle'), call('getNextBundle')])
    const nextId = bundleIdOf(next)
    if (nextId === null || nextId === bundleIdOf(current)) return false
    beforeReload()
    try {
      await call('reload')
    } catch (error) {
      if (!refused(error)) throw error
      return false
    }
    return true
  }

  let running: Promise<void> | undefined
  return {
    ready: () => call('ready'),
    applyNext,
    check: () => {
      running ??= run().finally(() => {
        running = undefined
      })
      return running
    },
  }
}
