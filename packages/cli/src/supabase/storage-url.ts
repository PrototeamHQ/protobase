// The hosts on which plain http stays on this machine, such as `supabase start`'s http://127.0.0.1:54321. URL parsing
// lowercases the host and writes a numeric IPv4 address in dotted form, so these are compared as they are.
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The Supabase project's URL, such as https://<ref>.supabase.co, which the storage report names, so never with
 * credentials. The secret key goes to it, so plain http is refused but on loopback. No message repeats the URL.
 */
export const projectUrl = (text: string) => {
  const url = URL.canParse(text) ? new URL(text) : undefined
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw new Error('--storage-url is not a URL; write it like https://<ref>.supabase.co')
  if (url.username || url.password) throw new Error('--storage-url must not hold credentials; put the secret key in the variable --storage-key-env names')
  if (url.protocol === 'http:' && !loopback.has(url.hostname)) throw new Error('--storage-url must use https, as it sends the secret key; plain http is only for a local Supabase on localhost, 127.0.0.1 or [::1]')
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}
