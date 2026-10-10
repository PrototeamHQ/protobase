// The database names of Better Auth's tables and columns: snake_case, like the app's own schemas. The code and the API
// keep Better Auth's camelCase names; only the store's tables and columns are named here. A name missing from these
// maps keeps Better Auth's, which is lowercase already (`user`, `token`, `scope`, ...).

/** Better Auth's own tables, as its `user`, `session`, `account` and `verification` options name them. */
export const coreNames = {
  user: { fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' } },
  session: {
    fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent', userId: 'user_id' },
  },
  account: {
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: { fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
}

/** The `schema` option of each plugin with tables or columns of its own. */
export const pluginNames = {
  admin: { user: { fields: { banReason: 'ban_reason', banExpires: 'ban_expires' } }, session: { fields: { impersonatedBy: 'impersonated_by' } } },
  jwt: { jwks: { fields: { publicKey: 'public_key', privateKey: 'private_key', createdAt: 'created_at', expiresAt: 'expires_at' } } },
  twoFactor: {
    user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
    twoFactor: {
      modelName: 'two_factor',
      fields: { backupCodes: 'backup_codes', userId: 'user_id', failedVerificationCount: 'failed_verification_count', lockedUntil: 'locked_until' },
    },
  },
  passkey: {
    passkey: { fields: { publicKey: 'public_key', userId: 'user_id', credentialID: 'credential_id', deviceType: 'device_type', backedUp: 'backed_up', createdAt: 'created_at' } },
  },
}
