import { sha256Hex } from '../../hash'

// 32 random bytes in base64url.
const randomPart = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** A runner's one-time registration token, `pbr_once_` and 32 random bytes in base64url, valid one hour. */
export const registrationPattern = /^pbr_once_[A-Za-z0-9_-]{43}$/

/** A runner's own token, `pbr_` and 32 random bytes in base64url, which every call it makes after registering carries. */
export const runnerTokenPattern = /^pbr_[A-Za-z0-9_-]{43}$/

/** How long a registration token is valid once issued. */
export const registrationMs = 3600 * 1000

export const newRegistrationToken = () => `pbr_once_${randomPart()}`
export const newRunnerToken = () => `pbr_${randomPart()}`

/** What a runner's tokens are kept and found by: their SHA-256, in hex; the tokens themselves are never kept. */
export const runnerTokenHash = sha256Hex
