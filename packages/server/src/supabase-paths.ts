/** Where the Supabase-compatible endpoints live, below the app's origin: supabase-js takes `<origin>/api/sb` as its URL. */
export const supabasePath = '/api/sb'

/** The PostgREST-compatible API of `from()` and `rpc()`. */
export const restPath = `${supabasePath}/rest/v1`

/** The Realtime-compatible socket of `channel()`. */
export const realtimePath = `${supabasePath}/realtime/v1`

/** The Storage-compatible API of `storage`. */
export const storagePath = `${supabasePath}/storage/v1`
