/**
 * What one socket and one topic of `/api/sb/realtime/v1` may do, near Supabase Realtime's own limits so an app within
 * its Free plan works as before. Each value names its Supabase setting, or says it has none.
 */
export const realtimeLimits = {
  /** A whole frame: the Free plan's 256 KB broadcast payload, with room for the envelope. */
  maxFrameBytes: 256 * 1024,
  /** Broadcast and presence pushes per socket (`TENANT_MAX_EVENTS_PER_SECOND`). */
  eventsPerSecond: 100,
  /** `phx_join`s per socket (`TENANT_MAX_JOINS_PER_SECOND`). */
  joinsPerSecond: 100,
  /** Broadcasts into one topic, every socket's together; no counterpart. */
  topicBroadcastsPerSecond: 100,
  /** Presence pushes per socket and topic in a window (`CLIENT_PRESENCE_MAX_CALLS`). */
  presencePerWindow: 5,
  /** `CLIENT_PRESENCE_WINDOW_MS`. */
  presenceWindowMs: 30_000,
  /** The JSON of one tracked meta, in bytes. */
  maxPresenceBytes: 10_000,
  /** Channels joined at once per socket (`TENANT_MAX_CHANNELS_PER_CLIENT`). */
  channelsPerSocket: 100,
  /** Output sent to a client that it has not read yet; no counterpart. */
  maxUnsentBytes: 4 * 1024 * 1024,
  /** Input waiting to be handled, such as behind a token check; no counterpart. */
  maxQueuedMessages: 300,
  maxQueuedBytes: 4 * 1024 * 1024,
}
