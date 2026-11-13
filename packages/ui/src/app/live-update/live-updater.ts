import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import type { NativeBridge } from '../native-auth-fetch'
import type { NativeSplash } from '../native-splash'
import { swapDecision } from './swap-decision'

/** The native bridge the live updater calls, with the error type a plugin rejects with (`window.Capacitor.Exception`). */
export type LiveUpdateBridge = Pick<NativeBridge, 'nativePromise'> & { Exception: abstract new (...args: never[]) => Error }

export type LiveUpdaterInput = {
  bridge: LiveUpdateBridge
  /** The server's answer, `undefined` when it gave none (see `checkRelease`). */
  check: () => Promise<MobileReleaseAnswer | undefined>
  /** `<api origin>/api/mobile/releases`, which the guard takes a release from only. */
  releasesUrl: string
  /** The native splash, shown over the page while it reloads into a release; none in a binary without it. */
  splash?: NativeSplash
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
export const createLiveUpdater = ({ bridge, check, releasesUrl, splash }: LiveUpdaterInput) => {
  const call = (method: string, options: object = {}) => bridge.nativePromise('LiveUpdate', method, options)
  const refused = (error: unknown) => error instanceof bridge.Exception

  // A call the guard refuses changed nothing, such as every call when the guard refuses to load: the updater then does
  // nothing either and gives `onRefusal`. Anything else is thrown.
  const unlessRefused = async <T>(action: () => Promise<T>, onRefusal: T) => {
    try {
      return await action()
    } catch (error) {
      if (!refused(error)) throw error
      return onRefusal
    }
  }

  const take = async (bundleId: string) => {
    await call('downloadBundle', { bundleId, url: `${releasesUrl}/${bundleId}`, artifactType: 'manifest' })
    await call('setNextBundle', { bundleId })
  }

  const run = () =>
    unlessRefused(async () => {
      const [answer, current, next] = await Promise.all([check(), call('getCurrentBundle'), call('getNextBundle')])
      const swap = swapDecision({ answer, current: bundleIdOf(current), next: bundleIdOf(next) })
      if (swap.kind === 'none') return
      await take(swap.bundleId)
    }, undefined)

  // The plugin's reload runs the next bundle under the same rollback as a cold start: the release must call ready().
  // The splash covers the page from just before the reload until the release has drawn and hides it; a reload that
  // does not happen hides it again.
  const applyNext = (beforeReload: () => void) =>
    unlessRefused(async () => {
      const [current, next] = await Promise.all([call('getCurrentBundle'), call('getNextBundle')])
      const nextId = bundleIdOf(next)
      if (nextId === null || nextId === bundleIdOf(current)) return false
      beforeReload()
      let reloaded = false
      try {
        await splash?.show()
        await call('reload')
        reloaded = true
      } finally {
        if (!reloaded) await splash?.hide()
      }
      return true
    }, false)

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
