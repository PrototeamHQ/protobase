import type { FunctionSocket } from '../functions/function-socket'
import { bridgeClosings } from './bridge-closings'

/** One bridge, from its token's check until it closes. */
export type BridgeAttempt = {
  /** Whether its target was withdrawn since it started. */
  withdrawn: () => boolean
  /** Its socket opened: a withdrawal from now on closes it, and one before closes it at once. */
  opened: (socket: FunctionSocket) => void
  /** It closed or failed: withdrawals no longer reach it. Calling it again does nothing. */
  end: () => void
}

/**
 * The bridges to each target, still being set up or open, so `withdraw(target)` reaches both: one being set up learns
 * it was withdrawn before it connects or upgrades, an open one closes with `withdrawn`.
 */
export const bridgeAttempts = () => {
  const byTarget = new Map<string, Set<{ withdraw: () => void }>>()

  const start = (target: string): BridgeAttempt => {
    let withdrawn = false
    let socket: FunctionSocket | undefined
    const close = () => socket?.close(bridgeClosings.withdrawn.code, bridgeClosings.withdrawn.reason)
    const entry = {
      withdraw: () => {
        withdrawn = true
        close()
      },
    }
    const attempts = byTarget.get(target) ?? new Set()
    byTarget.set(target, attempts.add(entry))
    return {
      withdrawn: () => withdrawn,
      opened: (opened) => {
        socket = opened
        if (withdrawn) close()
      },
      end: () => {
        attempts.delete(entry)
        if (attempts.size === 0 && byTarget.get(target) === attempts) byTarget.delete(target)
      },
    }
  }

  const withdraw = (target: string) => {
    for (const attempt of byTarget.get(target) ?? []) attempt.withdraw()
  }

  return { start, withdraw }
}
