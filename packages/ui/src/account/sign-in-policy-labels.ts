import type { SignInPolicy, SignInRule } from '@protobase/client'

export type PolicyMethod = keyof SignInPolicy

export type PolicyRow = { method: PolicyMethod; label: string; description: string; rules: Array<{ value: SignInRule; label: string }> }

const onOff = [
  { value: 'allowed', label: 'On' },
  { value: 'forbidden', label: 'Off' },
] satisfies PolicyRow['rules']

const optionalRequiredOff = [
  { value: 'allowed', label: 'Optional' },
  { value: 'required', label: 'Required' },
  { value: 'forbidden', label: 'Off' },
] satisfies PolicyRow['rules']

/** The rows of the sign-in policy page, in order, with the rules each method takes and their words. */
export const policyRows: PolicyRow[] = [
  { method: 'password', label: 'Password', description: 'Sign in with the email address and a password.', rules: onOff },
  { method: 'emailCode', label: 'Emailed sign-in code', description: "Sign in with a one-time code mailed to the account's address.", rules: onOff },
  {
    method: 'passkey',
    label: 'Passkeys',
    description: 'Sign in with Face ID, Touch ID, Windows Hello, a phone or a security key. Required: everyone adds one after signing in.',
    rules: optionalRequiredOff,
  },
  {
    method: 'twoFactor',
    label: 'Two-factor authentication',
    description: 'A code from an authenticator app, or an emailed one, after a password or an emailed sign-in code. Required: everyone turns it on after signing in.',
    rules: optionalRequiredOff,
  },
]

/** The word for `rule` in `method`'s row, for example "Optional" for an allowed passkey. Every rule the server stores has one. */
export const ruleLabel = (method: PolicyMethod, rule: SignInRule) => {
  const label = policyRows.find((row) => row.method === method)?.rules.find((option) => option.value === rule)?.label
  if (label === undefined) throw new Error(`No label for the ${rule} rule of ${method}`)
  return label
}
