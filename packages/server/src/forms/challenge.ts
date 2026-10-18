import { CappedMap, createChallenge, randomInt, verifySolution, type Challenge, type Solution } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'

/**
 * How many SHA-256 rounds a visitor's browser runs to send a form: the challenge is made for one count in this range,
 * and the solver counts up to it. About a second in Chromium on a current laptop: 0.4 s at the low end and 1.1 s at
 * the high end, measured on an Apple M1 Pro.
 */
export const formDifficulty: Difficulty = { min: 50_000, max: 100_000 }

/** The range of rounds a challenge is made for. */
export type Difficulty = { min: number; max: number }

/** A solved challenge, as a form submission carries it. */
export type FormProof = { challenge: Challenge; solution: Solution }

export type ProofVerdict = 'ok' | 'invalid' | 'expired' | 'replayed'

const expiresInSeconds = 5 * 60
// Spent challenges are remembered until they expire; past this many, the oldest go first.
const spentCapacity = 10_000

const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

// One key per purpose, derived from the secret by HKDF, as files derive theirs: the challenge and its key are signed apart.
const purposeKey = async (secret: string, info: string) => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveBits'])
  return toHex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) }, material, 256))
}

const isProof = (value: unknown): value is FormProof => {
  if (typeof value !== 'object' || value === null) return false
  const { challenge, solution } = value as Record<string, unknown>
  return typeof challenge === 'object' && challenge !== null && typeof (challenge as Challenge).parameters === 'object' && typeof solution === 'object' && solution !== null
}

/**
 * The bot check of public forms: a signed proof-of-work challenge (ALTCHA) per submission, made for one form and valid
 * for five minutes, which verifies once. The secret signs the challenges, so they verify on every instance that shares it.
 */
export const createFormChallenges = (secret: string, { difficulty = formDifficulty, now = Date.now }: { difficulty?: Difficulty; now?: () => number } = {}) => {
  const keys = Promise.all([purposeKey(secret, 'protobase forms challenge'), purposeKey(secret, 'protobase forms key')])
  const spent = new CappedMap<string, true>({ maxSize: spentCapacity })

  const issue = async (form: string): Promise<Challenge> => {
    const [hmacSignatureSecret, hmacKeySignatureSecret] = await keys
    return createChallenge({
      algorithm: 'SHA-256',
      cost: 1,
      deriveKey,
      counter: randomInt(difficulty.max, difficulty.min),
      data: { form },
      expiresAt: Math.floor(now() / 1000) + expiresInSeconds,
      hmacSignatureSecret,
      hmacKeySignatureSecret,
    })
  }

  const verify = async (form: string, proof: unknown): Promise<ProofVerdict> => {
    if (!isProof(proof) || proof.challenge.parameters.data?.form !== form) return 'invalid'
    const [hmacSignatureSecret, hmacKeySignatureSecret] = await keys
    const result = await verifySolution({ challenge: proof.challenge, solution: proof.solution, deriveKey, hmacSignatureSecret, hmacKeySignatureSecret })
    if (result.expired) return 'expired'
    if (!result.verified) return 'invalid'
    // The signature covers the challenge's random nonce and salt, so it names this challenge alone
    return spent.setIfAbsent(proof.challenge.signature!, true) ? 'ok' : 'replayed'
  }

  return { issue, verify }
}

export type FormChallenges = ReturnType<typeof createFormChallenges>
