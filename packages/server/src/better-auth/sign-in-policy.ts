/** What a policy says about one way of signing in: people may use it, must set it up, or cannot use it. */
export type SignInRule = 'allowed' | 'required' | 'forbidden'

/** Whether staff of the operator may sign in as people: yes, yes and each person gets an email about it, or no. */
export type StaffAccessRule = 'allowed' | 'notify' | 'forbidden'

/**
 * The app's sign-in policy. `password`, `emailCode` and `passkey` are ways to sign in; `twoFactor` is the second step
 * after a password or an emailed code. Only a passkey and two-factor authentication can be required: they are set up
 * once per person, so "required" sends everyone without one to set it up. `staffAccess` is whether the operator's
 * staff may sign in as people, for support.
 */
export type SignInPolicy = {
  password: 'allowed' | 'forbidden'
  emailCode: 'allowed' | 'forbidden'
  passkey: SignInRule
  twoFactor: SignInRule
  staffAccess: StaffAccessRule
}

export type SignInPolicyMethod = keyof SignInPolicy

/** Each method with the rules it takes, its name, and what the server answers when the policy turns it off. */
export const signInPolicyMethods = {
  password: { label: 'Password', rules: ['allowed', 'forbidden'], forbidden: 'Signing in with a password is turned off.' },
  emailCode: { label: 'Emailed sign-in code', rules: ['allowed', 'forbidden'], forbidden: 'Signing in with an emailed code is turned off.' },
  passkey: { label: 'Passkeys', rules: ['allowed', 'required', 'forbidden'], forbidden: 'Passkeys are turned off.' },
  twoFactor: { label: 'Two-factor authentication', rules: ['allowed', 'required', 'forbidden'], forbidden: 'Two-factor authentication is turned off.' },
  staffAccess: { label: 'Staff sign-in as a person', rules: ['allowed', 'notify', 'forbidden'], forbidden: 'Staff sign-in is turned off for this app.' },
} as const satisfies Record<SignInPolicyMethod, { label: string; rules: readonly (SignInRule | StaffAccessRule)[]; forbidden: string }>

/** Everything allowed and nothing required: the policy of an app whose admins never saved one. */
export const defaultSignInPolicy: SignInPolicy = { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed', staffAccess: 'allowed' }

const methodNames = Object.keys(signInPolicyMethods) as SignInPolicyMethod[]

/** A policy from a request body or a stored row; `undefined` when a method is missing or has a rule it does not take. */
export const parseSignInPolicy = (input: unknown): SignInPolicy | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const values = input as Record<string, unknown>
  const valid = methodNames.every((method) => (signInPolicyMethods[method].rules as readonly unknown[]).includes(values[method]))
  return valid ? (Object.fromEntries(methodNames.map((method) => [method, values[method]])) as SignInPolicy) : undefined
}

/**
 * The policy as it applies. Emailed codes need mail; without mail, password sign-in is on whatever the policy says, so
 * an app whose mail settings went missing does not lock out everyone who had only emailed codes left. Staff sign-in
 * that emails the person is off without mail, since nobody would be told.
 */
export const effectiveSignInPolicy = (policy: SignInPolicy, { mail }: { mail: boolean }): SignInPolicy =>
  mail ? policy : { ...policy, password: 'allowed', emailCode: 'forbidden', ...(policy.staffAccess === 'notify' && { staffAccess: 'forbidden' }) }

/**
 * What an account can sign in with and has set up. `authenticatorApp`: its two-factor authentication has an app (and
 * so backup codes), not only emailed codes. `socialSignIn`: it is linked to one of the app's sign-in providers.
 */
export type AccountMethods = { password: boolean; passkeys: number; twoFactor: boolean; authenticatorApp: boolean; socialSignIn: boolean }

/** The required methods `account` has not set up yet, in the order a setup page asks for them. */
export const missingRequiredMethods = (policy: SignInPolicy, account: Pick<AccountMethods, 'passkeys' | 'twoFactor'>) => [
  ...(policy.twoFactor === 'required' && !account.twoFactor ? (['twoFactor'] as const) : []),
  ...(policy.passkey === 'required' && account.passkeys === 0 ? (['passkey'] as const) : []),
]

/**
 * Why `policy` cannot be saved by an admin whose account is `admin`, or `undefined` when it can. It must keep a way
 * in for someone who has set nothing up (a password, or an emailed code with mail on), and leave the admin a way to
 * sign in. What it requires can always be set up after signing in.
 */
export const signInPolicyProblem = (policy: SignInPolicy, { mail, admin }: { mail: boolean; admin: AccountMethods }) => {
  if (policy.password === 'forbidden' && policy.emailCode === 'forbidden') {
    return 'Keep password or emailed-code sign-in on: people without a passkey need one of them to sign in.'
  }
  if (policy.password === 'forbidden' && !mail) {
    return 'Emailed codes need mail settings (PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM), so password sign-in has to stay on.'
  }
  if (policy.staffAccess === 'notify' && !mail) {
    return 'Emailing people when staff sign in as them needs mail settings (PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM).'
  }
  // Turning on two-factor authentication asks for the account's password.
  if (policy.password === 'forbidden' && policy.twoFactor === 'required') {
    return 'Two-factor authentication is turned on with the account password, so it cannot be required while password sign-in is off.'
  }
  const adminCanSignIn =
    (policy.password === 'allowed' && admin.password) ||
    (policy.emailCode === 'allowed' && mail) ||
    (policy.passkey !== 'forbidden' && admin.passkeys > 0) ||
    admin.socialSignIn
  return adminCanSignIn ? undefined : 'This policy would leave you without a way to sign in. Add a passkey first, or keep password sign-in on.'
}
