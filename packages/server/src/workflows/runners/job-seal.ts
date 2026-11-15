import { symmetricDecrypt } from 'better-auth/crypto'
import { readable, sealToken, type SecretKey } from '../../better-auth/connections/sealed-revocation'

/**
 * Seals a job's arguments with the app's secret while the job waits, as connections seal the tokens they revoke later,
 * and opens them again: `undefined` when they no longer open, as after the secret they were sealed with was retired.
 */
export const jobSealer = (key: () => Promise<SecretKey>) => ({
  seal: async (value: unknown) => sealToken(await key(), JSON.stringify(value) ?? 'null'),
  open: async (sealed: string): Promise<{ value: unknown } | undefined> => {
    const secret = await key()
    const text = await readable(() => symmetricDecrypt({ key: secret, data: sealed }))
    return text === undefined ? undefined : { value: JSON.parse(text) as unknown }
  },
})

export type JobSealer = ReturnType<typeof jobSealer>
