/** Where Supabase's Storage API serves an object's bytes to the secret key: each segment of the name encoded. */
export const objectUrl = (projectUrl: string, bucket: string, name: string) =>
  `${projectUrl.replace(/\/+$/, '')}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${name.split('/').map(encodeURIComponent).join('/')}`

/** The Supabase project to copy the bytes from: its URL, as `https://<ref>.supabase.co`, and its secret key. */
export type StorageSource = { url: string; key: string }

/** Fetches an object's bytes; the response is the caller's to read. */
export type Download = (bucket: string, name: string) => Promise<Response>

/** Downloads from the Supabase project `source` with its secret key, which goes in the request's headers only. */
export const supabaseDownload =
  (source: StorageSource): Download =>
  (bucket, name) =>
    fetch(objectUrl(source.url, bucket, name), { headers: { apikey: source.key, authorization: `Bearer ${source.key}` } })
