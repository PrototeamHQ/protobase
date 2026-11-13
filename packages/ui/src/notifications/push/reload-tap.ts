// A tap that arrives while the app reloads into a release, kept for the page it reloads into.
const tapKey = 'protobase.push.tap'

type TapStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type ReloadTapInput = {
  storage: TapStorage
  /** Whether the app is reloading into a release, from just before the reload until the release draws. */
  reloading: () => boolean
}

/**
 * Carries a tap on a push across a reload into a live update, which would otherwise lose it: `receive` keeps a tap that
 * arrives while the app reloads instead of opening it, and `resume` gives the page the app reloaded into that tap,
 * once. Any other tap goes to `open` at once.
 */
export const reloadTap = ({ storage, reloading }: ReloadTapInput) => ({
  receive: (data: unknown, open: (data: unknown) => void) => {
    if (!reloading()) return open(data)
    storage.setItem(tapKey, JSON.stringify(data ?? null))
  },
  resume: (open: (data: unknown) => void) => {
    const kept = storage.getItem(tapKey)
    if (kept === null) return
    storage.removeItem(tapKey)
    let data: unknown
    try {
      data = JSON.parse(kept)
    } catch (error) {
      if (error instanceof SyntaxError) return
      throw error
    }
    open(data)
  },
})
