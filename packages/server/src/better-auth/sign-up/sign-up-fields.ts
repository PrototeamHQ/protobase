/** What open sign-up asks for: the address always, and the person's name unless the app asks for the address only. */
export type SignUpField = 'email' | 'name'

const fields: SignUpField[] = ['email', 'name']

/**
 * The fields open sign-up asks for, from `signUp.fields`: `['email', 'name']` without it. The address is always one of
 * them, and any other name is an error.
 */
export const resolveSignUpFields = (configured: readonly string[] | undefined): SignUpField[] => {
  if (configured === undefined) return fields
  const unknown = configured.find((field) => !fields.includes(field as SignUpField))
  if (unknown !== undefined) throw new Error(`signUp.fields takes ${fields.join(' and ')}, not "${unknown}"`)
  if (!configured.includes('email')) throw new Error("signUp.fields needs 'email': an account is made for a proven address")
  return fields.filter((field) => configured.includes(field))
}
