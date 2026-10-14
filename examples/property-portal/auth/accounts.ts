import type { CreateAuthOptions } from '@protobase/server'

/**
 * Who has an account, and what a new one is. Anyone makes their own from the sign-in page, as a member, once a code
 * mailed to their address proves it is theirs; admins are made on the host (`protobase users create --role admin`).
 */
export const accounts = {
  roles: ['admin', 'member'],
  // `protobase users create` without `--role` makes a member too.
  defaultRole: 'member',
  signUp: { role: 'member' },
} satisfies Pick<CreateAuthOptions, 'roles' | 'defaultRole' | 'signUp'>
