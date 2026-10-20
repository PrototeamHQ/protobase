const pending = new Set<Promise<void>>()

/**
 * Keeps the process up until `work` settles, as Supabase's `EdgeRuntime.waitUntil`: a function answers at once and
 * goes on working after its response. A graceful shutdown awaits the work (`backgroundSettled`); a process killed
 * before it settles loses it. A rejection is printed, as nobody awaits the work to see it.
 */
export const waitUntil = (work: Promise<unknown>) => {
  const tracked = work.then(
    () => undefined,
    (error: unknown) => console.error(error),
  )
  pending.add(tracked)
  void tracked.then(() => pending.delete(tracked))
}

/** Resolves once every `waitUntil` work has settled, including work started while it waits. */
export const backgroundSettled = async () => {
  while (pending.size > 0) await Promise.all(pending)
}
