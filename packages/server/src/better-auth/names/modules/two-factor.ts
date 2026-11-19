import { field, type ModuleDeclaration } from '../declaration'

/** Two-step sign-in: each user's authenticator secret and backup codes. */
export const twoFactor = {
  id: 'two_factor',
  requires: ['auth'],
  tables: {
    two_factor: {
      model: 'twoFactor',
      scope: 'global',
      columns: {
        secret: field('secret'),
        backup_codes: field('backupCodes'),
        user_id: field('userId'),
        verified: field('verified'),
        failed_verification_count: field('failedVerificationCount'),
        locked_until: field('lockedUntil'),
      },
      indexes: ['two_factor_secret_idx', 'two_factor_user_id_idx'],
    },
  },
  columns: { user: { two_factor_enabled: field('twoFactorEnabled') } },
} as const satisfies ModuleDeclaration
