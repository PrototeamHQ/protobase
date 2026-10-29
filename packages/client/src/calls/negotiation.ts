/**
 * One offer in flight at a time: a change while an offer waits for its answer offers once more after it. `settled`
 * resolves once no offer is in flight or queued, so a caller can wait for its change to be agreed.
 */
export const negotiation = (offer: () => Promise<void>) => {
  let inFlight = false
  let again = false
  const waiting: (() => void)[] = []

  const start = async () => {
    inFlight = true
    again = false
    await offer()
  }
  const settle = () => {
    for (const resolve of waiting.splice(0)) resolve()
  }

  return {
    /** Offers now, or once the offer in flight is answered. */
    request: async () => {
      if (inFlight) {
        again = true
        return
      }
      await start()
    },
    /** The answer to the offer in flight arrived: offers again when a change came meanwhile. */
    answered: async () => {
      inFlight = false
      if (again) return start()
      settle()
    },
    /** The offer in flight will not be answered, such as on a lost session: it is made again by the next `request`. */
    abandon: () => {
      if (inFlight) again = true
      inFlight = false
    },
    /** Whether an offer waits to be made again after `abandon`. */
    get pending() {
      return again
    },
    settled: () => (inFlight || again ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve()),
    /** Forgets every offer, for a new peer connection; whoever waited is let go. */
    reset: () => {
      inFlight = false
      again = false
      settle()
    },
  }
}
