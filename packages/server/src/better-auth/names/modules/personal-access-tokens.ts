import { own, type ModuleDeclaration } from '../declaration'

/** The personal access tokens people make for their scripts: one row per token, holding its hash and never the token. */
export const personalAccessTokens = {
  id: 'personal_access_tokens',
  requires: ['auth'],
  tables: {
    personal_access_token: {
      model: 'personalAccessToken',
      scope: 'global',
      columns: {
        user_id: own('userId', { type: 'string', required: true }),
        name: own('name', { type: 'string', required: true }),
        token_hash: own('tokenHash', { type: 'string', required: true }),
        role: own('role', { type: 'string', required: true }),
        created_at: own('createdAt', { type: 'date', required: true }),
        expires_at: own('expiresAt', { type: 'date', required: false }),
        last_used_at: own('lastUsedAt', { type: 'date', required: false }),
      },
      indexes: ['personal_access_token_user_id_idx'],
    },
  },
} as const satisfies ModuleDeclaration
