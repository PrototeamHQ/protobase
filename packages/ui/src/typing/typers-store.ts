import { heardTyping, nextExpiry, withoutExpired, type Typers } from './typing'

/**
 * Who types where, as a page heard it on its channels, each typer kept until their typing runs out: `heard` takes a
 * typing payload, `clear` forgets everyone, such as while the channel is down, and `stop` ends the expiry timer.
 */
export const createTypersStore = () => {
  let typers: Typers = new Map()
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  // Draws the typers again when the first of them runs out.
  const set = (next: Typers) => {
    if (next === typers) return
    typers = next
    for (const listener of [...listeners]) listener()
    clearTimeout(timer)
    const at = nextExpiry(typers)
    if (at !== undefined) timer = setTimeout(() => set(withoutExpired(typers, Date.now())), Math.max(0, at - Date.now()))
  }

  return {
    typers: () => typers,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    heard: (channel: string, user: string, payload: unknown) => set(heardTyping(typers, channel, user, payload, Date.now())),
    clear: () => set(new Map()),
    stop: () => clearTimeout(timer),
  }
}

export type TypersStore = ReturnType<typeof createTypersStore>
