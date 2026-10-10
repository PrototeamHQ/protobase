/** HMAC-SHA256 signatures over JSON values, under a key derived from the files secret by HKDF; one purpose never verifies as another. */
export type Signer = {
  sign(purpose: string, parts: unknown[]): Promise<string>
  verify(purpose: string, parts: unknown[], signature: string): Promise<boolean>
}

const encoder = new TextEncoder()

const toBase64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

const fromBase64Url = (text: string) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return undefined
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))
}

export const createSigner = (secret: string): Signer => {
  const key = (async () => {
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode('protobase files') },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    )
  })()
  const content = (purpose: string, parts: unknown[]) => encoder.encode(JSON.stringify([purpose, ...parts]))
  return {
    sign: async (purpose, parts) => toBase64Url(await crypto.subtle.sign('HMAC', await key, content(purpose, parts))),
    // Web Crypto's verify compares in constant time.
    verify: async (purpose, parts, signature) => {
      const bytes = fromBase64Url(signature)
      return bytes !== undefined && crypto.subtle.verify('HMAC', await key, bytes, content(purpose, parts))
    },
  }
}
