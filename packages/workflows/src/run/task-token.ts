/** A task token: 32 random bytes in base64url, which grants answering one try of one waiting Task. */
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/

/** A new task token. */
export const newTaskToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** What a token is kept and found by: its SHA-256, in hex. */
export const taskTokenHash = async (token: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
