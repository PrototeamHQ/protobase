import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import type { NativeBridge } from '../native-auth-fetch'
import { swapDecision } from './swap-decision'

/** How long a required update may hold the app at launch before it goes on with the files it runs. */
export const requiredUpdateTimeoutMs = 60_000

/** The native bridge the live updater calls, with the error type a plugin rejects with (`window.Capacitor.Exception`). */
export type LiveUpdateBridge = Pick<NativeBridge, 'nativePromise'> & { Exception: abstract new (...args: never[]) => Error }

export type LiveUpdaterInput = {
  bridge: LiveUpdateBridge
  /** The server's answer, `undefined` when it gave none (see `checkRelease`). */
  check: () => Promise<MobileReleaseAnswer | undefined>
  /** `<api origin>/api/mobile/releases`, which the Android guard takes a release from only. */
  releasesUrl: string
  /** Called with true while a required update holds the app, and false once it goes on. */
  onHold: (holding: boolean) => void
}

// The id a getCurrentBundle or getNextBundle answer names, null for the app's own files.
const bundleIdOf = (result: unknown) => {
  const id = typeof result === 'object' && result !== null ? (result as { bundleId?: unknown }).bundleId : undefined
  return typeof id === 'string' ? id : null
}

/**
 * The app's side of the live updater, through Protobase's guarded LiveUpdate plugin, which checks every release
 * itself. `ready()` tells the plugin the files the app runs started; `check(launch)` asks the server and takes a new
 * release for the next cold start, one check at a time. A release the guard refuses, or a call that fails, leaves the
 * app on the files it runs.
 */
export const createLiveUpdater = ({ bridge, check, releasesUrl, onHold }: LiveUpdaterInput) => {
  const call = (method: string, options: object = {}) => bridge.nativePromise('LiveUpdate', method, options)
  const refused = (error: unknown) => error instanceof bridge.Exception

  const take = async (bundleId: string, download: boolean) => {
    if (download) await call('downloadBundle', { bundleId, url: `${releasesUrl}/${bundleId}`, artifactType: 'manifest' })
    await call('setNextBundle', { bundleId })
  }

  // Holds the app until the release runs, the guard refuses it, or the time is up; past it, the release is still set
  // next if it arrives, for the next cold start, and the app is never reloaded under the user.
  const takeHolding = async (bundleId: string, download: boolean) => {
    let holding = true
    const release = () => {
      if (!holding) return
      holding = false
      onHold(false)
    }
    onHold(true)
    const timer = setTimeout(release, requiredUpdateTimeoutMs)
    try {
      await take(bundleId, download)
      if (holding) await call('reload')
    } finally {
      clearTimeout(timer)
      release()
    }
  }

  const run = async (launch: boolean) => {
    const [answer, current, next] = await Promise.all([check(), call('getCurrentBundle'), call('getNextBundle')])
    const swap = swapDecision({ answer, current: bundleIdOf(current), next: bundleIdOf(next), launch })
    if (swap.kind === 'none') return
    try {
      await (swap.reload ? takeHolding(swap.bundleId, swap.download) : take(swap.bundleId, swap.download))
    } catch (error) {
      if (!refused(error)) throw error
    }
  }

  let running: Promise<void> | undefined
  return {
    ready: () => call('ready'),
    check: (launch: boolean) => {
      running ??= run(launch).finally(() => {
        running = undefined
      })
      return running
    },
  }
}
