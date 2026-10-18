import { createChallenge, randomInt, verifySolution } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'
import { ApiError, type FormProof, type PublicForm } from '@protobase/client'

type Row = Record<string, unknown>

// The fake server's own secret: its challenges are signed and checked as the real server's are.
const secret = 'fake forms'

const refused = (status: number, slug: string, detail: string) => new ApiError({ type: `urn:protobase:problem:${slug}`, title: status === 429 ? 'Too Many Requests' : 'Bad Request', status, detail })

/**
 * The public forms of the fake API: each described as the server does, a real bot check that takes the browser a few
 * rounds, and a submission that creates a row through `create`, unless `submit` answers it, to refuse it.
 */
export const fakeForms = (forms: readonly PublicForm[], create: (resource: string, values: Row) => Promise<unknown>, submit?: (name: string, values: Row) => Promise<void>) => {
  const find = (name: string) => {
    const form = forms.find((entry) => entry.name === name)
    if (!form) throw refused(404, 'not-found', `There is no form "${name}"`)
    return form
  }
  return {
    form: async (name: string) => find(name),
    formChallenge: async (name: string) =>
      createChallenge({ algorithm: 'SHA-256', cost: 1, deriveKey, counter: randomInt(200, 50), data: { form: find(name).name }, hmacSignatureSecret: secret }),
    submitForm: async (name: string, values: Row, proof: FormProof) => {
      const form = find(name)
      const result = await verifySolution({ ...proof, deriveKey, hmacSignatureSecret: secret })
      if (!result.verified || proof.challenge.parameters.data?.form !== name) throw refused(400, 'bot-check-failed', 'The check that you are not a bot failed; send the form again')
      if (submit) return submit(name, values)
      await create(form.resource.name, values)
    },
  }
}
