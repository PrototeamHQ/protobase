const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

const secretKey = (secret: string) => {
  const text = secret.replace(/^whsec_/, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('A webhook secret is `whsec_` and base64')
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

/** A new signing secret, `whsec_` and 32 random bytes in base64. */
export const newWebhookSecret = () => `whsec_${base64(crypto.getRandomValues(new Uint8Array(32)))}`

const sign = async (secret: string, content: string) => {
  const key = await crypto.subtle.importKey('raw', secretKey(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `v1,${base64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))))}`
}

/**
 * The Standard Webhooks headers of one request (https://www.standardwebhooks.com): its id, its time in seconds and,
 * with a secret, the HMAC-SHA256 of `id.timestamp.body` as `v1,<base64>`; with several, one signature per secret,
 * separated by spaces, as during a rotation.
 */
export const standardWebhookHeaders = async (id: string, timestamp: number, body: string, secret?: string | string[]): Promise<Record<string, string>> => {
  const headers = { 'webhook-id': id, 'webhook-timestamp': String(timestamp) }
  const secrets = secret === undefined ? [] : [secret].flat()
  if (secrets.length === 0) return headers
  const signatures = await Promise.all(secrets.map((each) => sign(each, `${id}.${timestamp}.${body}`)))
  return { ...headers, 'webhook-signature': signatures.join(' ') }
}
