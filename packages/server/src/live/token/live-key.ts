/** What the live token key is derived for, so the same secret signs relay tickets and seals live tokens apart. */
const info = 'protobase live token'

/** The 256-bit key live tokens are sealed with: HKDF-SHA-256 of the relay's ticket key, which the relay holds too. */
export const liveTokenKey = async (ticketKey: string) => {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(ticketKey), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info) }, secret, 256)
  return new Uint8Array(bits)
}
