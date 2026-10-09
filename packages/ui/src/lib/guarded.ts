/** Runs a storage access; storage can be unavailable (private windows, blocked site data), which is a DOMException. Anything else is a bug. */
export const guarded = <T>(action: () => T, fallback: T) => {
  try {
    return action()
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    return fallback
  }
}
