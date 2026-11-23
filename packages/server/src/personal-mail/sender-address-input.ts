import * as z from 'zod'

/**
 * A From address as it may go into a From header, wherever it comes from: what a person types and what a provider
 * lists alike. A line break or other control character would end the header, so it is refused, as is anything that is
 * not an address; a valid one is trimmed and lowercased, the spelling the store keeps.
 */
export const senderAddressInput = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\p{Cc}]*$/u)
  .pipe(z.email())
  .transform((address) => address.toLowerCase())

/** `value` as a From address (`senderAddressInput`), or undefined when it is none. */
export const senderAddressOf = (value: unknown) => {
  const parsed = senderAddressInput.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
