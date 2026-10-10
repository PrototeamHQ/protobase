import type { SignInPolicy, SignInRule, StaffAccessRule } from '@protobase/client'

export type PolicyMethod = keyof SignInPolicy

/** A rule any row takes; each row offers only its own. */
export type PolicyRule = SignInRule | StaffAccessRule

export type PolicyRow = { method: PolicyMethod; label: string; description: string; rules: Array<{ value: PolicyRule; label: string }> }

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
  {
    method: 'staffAccess',
    label: 'Staff sign-in as a person',
    description: 'The team that runs this app signs in as someone to help them, with a reason, for a short session. Each time is in the log below; with "Email the person" they are told too.',
    rules: [
      { value: 'allowed', label: 'On' },
      { value: 'notify', label: 'Email the person' },
      { value: 'forbidden', label: 'Off' },
    ],
  },
  {
    method: 'platformSignIn',
    label: 'Sign-in through the platform',
    description: 'The sign-in provider the platform that runs this app adds, for people who have an account here already. It never creates accounts.',
    rules: onOff,
  },
]

/** The word for `rule` in `method`'s row, for example "Optional" for an allowed passkey. Every rule the server stores has one. */
export const ruleLabel = (method: PolicyMethod, rule: PolicyRule) => {
  const label = policyRows.find((row) => row.method === method)?.rules.find((option) => option.value === rule)?.label
  if (label === undefined) throw new Error(`No label for the ${rule} rule of ${method}`)
  return label
}
