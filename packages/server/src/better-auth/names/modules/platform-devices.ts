import { own, type ModuleDeclaration } from '../declaration'

/** The device accounts people signed out of, one row per provider and subject, and the sessions each device account began. */
export const platformDevices = {
  id: 'platform_devices',
  requires: ['auth'],
  tables: {
    refused_account: {
      model: 'refusedAccount',
      scope: 'global',
      columns: {
        provider_id: own('providerId', { type: 'string', required: true }),
        account_id: own('accountId', { type: 'string', required: true }),
        user_id: own('userId', { type: 'string', required: true }),
        created_at: own('createdAt', { type: 'date', required: true }),
      },
      indexes: ['refused_account_user_id_idx'],
    },
    device_session: {
      model: 'deviceSession',
      scope: 'global',
      columns: {
        session_id: own('sessionId', { type: 'string', required: true }),
        account_id: own('accountId', { type: 'string', required: true }),
        created_at: own('createdAt', { type: 'date', required: true }),
      },
      indexes: ['device_session_account_id_idx'],
    },
  },
} as const satisfies ModuleDeclaration
