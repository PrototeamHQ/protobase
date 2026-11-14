import { ApiError, isApiError } from '@protobase/client'
import type { ActionInputModel } from '@protobase/schema'

const mask = '••••••'

/** The answers of the secret inputs among `values`, those not empty. */
export const secretAnswers = (inputs: ActionInputModel[], values: Record<string, unknown>) =>
  inputs.flatMap((input) => {
    const value = values[input.name]
    return input.kind === 'secret' && typeof value === 'string' && value !== '' ? [value] : []
  })

// Which characters of `text` belong to an occurrence of a secret, every occurrence found in the text as it is, overlaps included.
const covered = (text: string, secrets: string[]) => {
  const hidden = new Array<boolean>(text.length).fill(false)
  for (const secret of secrets) {
    for (let at = text.indexOf(secret); at !== -1; at = text.indexOf(secret, at + 1)) hidden.fill(true, at, at + secret.length)
  }
  return hidden
}

/** `text` with each run of characters that belongs to one of `secrets` replaced by discs, so overlapping secrets leave none of either showing. */
export const maskSecrets = (text: string, secrets: string[]) => {
  const hidden = covered(text, secrets.filter((secret) => secret !== ''))
  let masked = ''
  for (let index = 0; index < text.length; index++) {
    if (!hidden[index]) masked += text[index]
    else if (index === 0 || !hidden[index - 1]) masked += mask
  }
  return masked
}

/**
 * A failure as the dialog may show it: one whose message or problem holds a secret answer comes back with each masked,
 * so a handler that echoes the value never draws it on screen.
 */
export const maskedFailure = (error: unknown, secrets: string[]) => {
  if (secrets.length === 0) return error
  if (isApiError(error)) {
    // The problem is masked as JSON, where a secret appears in its escaped form.
    const escaped = secrets.map((secret) => JSON.stringify(secret).slice(1, -1))
    return new ApiError(JSON.parse(maskSecrets(JSON.stringify(error.problem), escaped)))
  }
  if (!(error instanceof Error)) return error
  const masked = new Error(maskSecrets(error.message, secrets))
  masked.name = error.name
  return masked
}

/** Messages by input name, each with the secret answers masked. */
export const maskedMessages = (messages: Record<string, string>, secrets: string[]) =>
  Object.fromEntries(Object.entries(messages).map(([name, message]) => [name, maskSecrets(message, secrets)]))
