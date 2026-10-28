/**
 * The bounds of `/api/channels` that its limits (`realtimeLimits`, the same as `/api/sb/realtime/v1`'s) do not give,
 * each no looser than its counterpart there.
 */
export const channelBounds = {
  /** How often the client says it is there; `@protobase/client` sends a ping this often. */
  pingMs: 5_000,
  /** How long a connection may stay silent before it is closed and its presences leave: 60 s on `/api/sb/realtime/v1`. */
  idleMs: 12_000,
  /** How often a connection's session, and its read access to each channel's record, are checked again. */
  recheckMs: 10_000,
  /** How long a send trusts the last check that the caller may read the record. */
  readCacheMs: 5_000,
}
