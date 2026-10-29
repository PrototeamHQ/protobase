/** How `/api/channels` and `/api/sb/realtime/v1` are served (`realtime` in `protobase.config.ts`). */
export type RealtimeOptions = {
  /**
   * `'one'`, the default, when one process serves the app: broadcasts and presence go between its channels in memory.
   * `'many'` when several processes serve it behind one address: they go between the processes through the
   * `realtime_relay` schema of the app's database, which `protobase migration` writes.
   */
  processes?: 'one' | 'many'
  /**
   * `true` lets SQL in the app's database broadcast to the record channels with `channels.send()`, from the `channels`
   * schema `protobase migration` writes.
   */
  sqlSends?: boolean
}

/** Whether the options share broadcasts and presence between processes. */
export const relayed = (options: RealtimeOptions = {}) => {
  if (options.processes === undefined || options.processes === 'one') return false
  if (options.processes === 'many') return true
  throw new Error(`Invalid realtime.processes "${String(options.processes)}": use "one" or "many"`)
}

/** Whether the options let SQL broadcast to the record channels. */
export const sqlSends = (options: RealtimeOptions = {}) => {
  if (options.sqlSends === undefined) return false
  if (typeof options.sqlSends === 'boolean') return options.sqlSends
  throw new Error(`Invalid realtime.sqlSends "${String(options.sqlSends)}": use true or false`)
}
