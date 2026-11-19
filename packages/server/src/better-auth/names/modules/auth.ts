import { field, own, type ModuleDeclaration } from '../declaration'

/** Sign-in itself: users, with their roles and bans, sessions, accounts, codes, the token signing keys and the record of migrations. */
export const auth = {
  id: 'auth',
  requires: [],
  tables: {
    user: {
      model: 'user',
      scope: 'global',
      columns: {
        name: field('name'),
        email: field('email'),
        email_verified: field('emailVerified'),
        image: field('image'),
        created_at: field('createdAt'),
        updated_at: field('updatedAt'),
        role: field('role'),
        banned: field('banned'),
        ban_reason: field('banReason'),
        ban_expires: field('banExpires'),
        last_role: own('lastRole', { type: 'string', required: false, input: false }),
        email_confirmed_at: own('emailConfirmedAt', { type: 'date', required: false, input: false }),
      },
      indexes: ['user_active_admin_idx', 'user_created_at_id_idx', 'user_name_id_idx', 'user_name_trgm_idx'],
    },
    session: {
      model: 'session',
      scope: 'global',
      columns: {
        expires_at: field('expiresAt'),
        token: field('token'),
        created_at: field('createdAt'),
        updated_at: field('updatedAt'),
        ip_address: field('ipAddress'),
        user_agent: field('userAgent'),
        user_id: field('userId'),
        impersonated_by: field('impersonatedBy'),
        active_role: own('activeRole', { type: 'string', required: false, input: false }),
      },
      indexes: ['session_user_id_idx'],
    },
    account: {
      model: 'account',
      scope: 'global',
      columns: {
        account_id: field('accountId'),
        provider_id: field('providerId'),
        user_id: field('userId'),
        access_token: field('accessToken'),
        refresh_token: field('refreshToken'),
        id_token: field('idToken'),
        access_token_expires_at: field('accessTokenExpiresAt'),
        refresh_token_expires_at: field('refreshTokenExpiresAt'),
        scope: field('scope'),
        password: field('password'),
        created_at: field('createdAt'),
        updated_at: field('updatedAt'),
        single_subject_user_id: own('singleSubjectUserId', { type: 'string', required: false, input: false }),
      },
      indexes: ['account_user_id_idx', 'account_provider_id_account_id_uidx', 'account_provider_id_single_subject_user_id_uidx'],
    },
    verification: {
      model: 'verification',
      scope: 'global',
      columns: { identifier: field('identifier'), value: field('value'), expires_at: field('expiresAt'), created_at: field('createdAt'), updated_at: field('updatedAt') },
      indexes: ['verification_identifier_idx', 'verification_identifier_pattern_idx'],
    },
    jwks: {
      model: 'jwks',
      scope: 'global',
      columns: { public_key: field('publicKey'), private_key: field('privateKey'), created_at: field('createdAt'), expires_at: field('expiresAt'), alg: field('alg'), crv: field('crv') },
    },
    auth_migrations: {
      scope: 'global',
      columns: { version: field('version'), name: field('name'), applied_at: field('appliedAt') },
    },
  },
} as const satisfies ModuleDeclaration
