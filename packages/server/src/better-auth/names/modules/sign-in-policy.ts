import { own, type ModuleDeclaration } from '../declaration'

/** The sign-in policy admins save: one row per save, the newest applies, the older ones are its history. */
export const signInPolicy = {
  id: 'sign_in_policy',
  requires: ['auth'],
  tables: {
    sign_in_policy: {
      model: 'signInPolicy',
      scope: 'global',
      columns: {
        password: own('password', { type: 'string', required: true }),
        email_code: own('emailCode', { type: 'string', required: true }),
        passkey: own('passkey', { type: 'string', required: true }),
        two_factor: own('twoFactor', { type: 'string', required: true }),
        // Rows saved before staff sign-in existed get the default when the migration adds the column.
        staff_access: own('staffAccess', { type: 'string', required: true, defaultValue: 'allowed' }),
        // Likewise for rows saved before sign-in through the platform existed.
        platform_sign_in: own('platformSignIn', { type: 'string', required: true, defaultValue: 'allowed' }),
        created_at: own('createdAt', { type: 'date', required: true }),
        created_by: own('createdBy', { type: 'string', required: false }),
      },
    },
  },
} as const satisfies ModuleDeclaration
