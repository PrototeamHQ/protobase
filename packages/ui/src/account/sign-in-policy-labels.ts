import type { SignInPolicy, SignInRule, StaffAccessRule } from '@protobase/client'
import { text } from './messages'

export type PolicyMethod = keyof SignInPolicy

/** A rule any row takes; each row offers only its own. */
export type PolicyRule = SignInRule | StaffAccessRule

export type PolicyRow = { method: PolicyMethod; label: string; description: string; rules: Array<{ value: PolicyRule; label: string }> }

const onOff = () => [
  { value: 'allowed', label: text('on') },
  { value: 'forbidden', label: text('off') },
] satisfies PolicyRow['rules']

const optionalRequiredOff = () => [
  { value: 'allowed', label: text('optional') },
  { value: 'required', label: text('required') },
  { value: 'forbidden', label: text('off') },
] satisfies PolicyRow['rules']

/** The rows of the sign-in policy page, in order, with the rules each method takes and their words. */
export const policyRows = (): PolicyRow[] => [
  { method: 'password', label: text('password'), description: text('passwordDescription'), rules: onOff() },
  { method: 'emailCode', label: text('emailedSignInCode'), description: text('emailedSignInCodeDescription'), rules: onOff() },
  {
    method: 'passkey',
    label: text('passkeys'),
    description: text('passkeysPolicyDescription'),
    rules: optionalRequiredOff(),
  },
  {
    method: 'twoFactor',
    label: text('twoFactor'),
    description: text('twoFactorPolicyDescription'),
    rules: optionalRequiredOff(),
  },
  {
    method: 'staffAccess',
    label: text('staffAccess'),
    description: text('staffAccessDescription'),
    rules: [
      { value: 'allowed', label: text('on') },
      { value: 'notify', label: text('emailThePerson') },
      { value: 'forbidden', label: text('off') },
    ],
  },
  {
    method: 'platformSignIn',
    label: text('platformSignIn'),
    description: text('platformSignInDescription'),
    rules: onOff(),
  },
]

/** The word for `rule` in `method`'s row, for example "Optional" for an allowed passkey. Every rule the server stores has one. */
export const ruleLabel = (method: PolicyMethod, rule: PolicyRule) => {
  const label = policyRows().find((row) => row.method === method)?.rules.find((option) => option.value === rule)?.label
  if (label === undefined) throw new Error(`No label for the ${rule} rule of ${method}`)
  return label
}
