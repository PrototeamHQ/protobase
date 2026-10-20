import { parseError } from './rest-error'

/** The whole number a `limit` or `offset` parameter named `name` gives. */
export const wholeNumber = (name: string, text: string) => {
  if (!/^\d+$/.test(text)) throw parseError(`"failed to parse ${name} (${text})"`, `${name} takes a whole number`)
  return Number(text)
}
