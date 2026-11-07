/**
 * Holds the taps that arrive before the sign-in is known, such as the one that launched the app from a cold start, and
 * hands each to `open` once it is; after that, every tap goes to `open` at once. `open` decides what a tap opens for
 * whoever is signed in then.
 */
export const nativeTapGate = (open: (data: unknown) => void) => {
  let ready = false
  const pending: unknown[] = []
  return {
    tap: (data: unknown) => (ready ? open(data) : void pending.push(data)),
    /** The sign-in is known, or known again, as `known` says. */
    settle: (known: boolean) => {
      ready = known
      if (known) for (const data of pending.splice(0)) open(data)
    },
  }
}
