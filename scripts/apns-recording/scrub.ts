// What an APNs recording keeps: the request's path, APNs headers and body and APNs's status and reason, never the
// provider token, the key or anything the key's id or team id could be read from.

/** The request headers a recording keeps; the `authorization` header with the provider token is never among them. */
export const keptRequestHeaders = new Set([':method', ':path', 'content-type', 'apns-topic', 'apns-push-type', 'apns-priority', 'apns-expiration', 'apns-collapse-id'])

// A JWT (three base64url parts, the first a JSON header), a PEM block, or a long base64 run of both cases such as a
// key's body; a device token is lowercase hex, so it is not one.
const shapes: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/, 'a JWT'],
  [/-----BEGIN|PRIVATE KEY/, 'a PEM key'],
  [/bearer/i, 'a bearer token'],
  [/(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])[A-Za-z0-9+/]{40,}/, 'a base64 run as long as a key'],
]

// The only device token a recording may hold: one of no device.
const deviceToken = /[0-9a-f]{64,}/g
const noDevice = /^0+$/

/** What `text` would leak, by kind, never its value: a secret it holds, a real device's token, or the shape of a token or key. */
export const findLeak = (text: string, secrets: readonly string[]) => {
  if (secrets.some((secret) => secret.length >= 4 && text.includes(secret))) return 'a secret value'
  if ([...text.matchAll(deviceToken)].some(([token]) => !noDevice.test(token))) return 'a device token'
  return shapes.find(([shape]) => shape.test(text))?.[1]
}

/** The secrets of a key's settings, as a recording must not hold them: the key id, team id and each line of the PEM. */
export const secretsOf = (env: Record<string, string | undefined>, names: readonly string[]) =>
  names.flatMap((name) => (env[name] ?? '').split('\n').map((line) => line.trim()).filter((line) => line.length >= 4 && !line.startsWith('-----')))
