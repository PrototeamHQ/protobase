import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'
import type { Client, FormProof } from '@protobase/client'

/**
 * The bot check of a public form, done: fetches a fresh challenge and solves it in this browser, about a second of its
 * work, so a check never expires while someone types.
 */
export const proveHuman = async (client: Pick<Client, 'formChallenge'>, name: string): Promise<FormProof> => {
  const challenge = await client.formChallenge(name)
  const solution = await solveChallenge({ challenge, deriveKey })
  if (!solution) throw new Error('The check that you are not a bot took too long; send the form again')
  return { challenge, solution: { counter: solution.counter, derivedKey: solution.derivedKey } }
}
