import type { Admin, RealtimePrune } from '@protobase/server'

// On globalThis: the dev server's entry module is evaluated again on every edit, the prune is started once.
const store = globalThis as { __protobaseRealtimePrune?: RealtimePrune }

/**
 * Prunes the realtime tables in the dev server, from its first load on; `realtime.processes` changed later is the
 * prune's from the next start.
 */
export const devRealtimePrune = (admin: Admin) => {
  if (store.__protobaseRealtimePrune) return
  store.__protobaseRealtimePrune = admin.startRealtimePrune()
}

/** Stops the prune, after one in progress, when the dev server closes. */
export const stopDevRealtimePrune = async () => {
  const prune = store.__protobaseRealtimePrune
  delete store.__protobaseRealtimePrune
  await prune?.stop()
}
