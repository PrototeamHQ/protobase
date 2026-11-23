import { sha256Hex } from '../../hash'

/** A new verification's secret: 256 random bits, base64url, from the platform's CSPRNG. */
export const mintSecret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')

/** What a verification keeps of its secret: its SHA-256, so a read of the store cannot settle one. */
export const secretHash = (secret: string) => sha256Hex(secret)
