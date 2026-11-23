import { own, type ModuleDeclaration } from '../declaration'

/**
 * The From addresses people send as through a mailbox connection: one row per connection and address, with what the
 * provider says of it; and the verifications the app's verifiers ran on them, each holding its secret's hash, never the secret.
 */
export const mailSenders = {
  id: 'mail_senders',
  requires: ['auth'],
  tables: {
    mail_sender: {
      model: 'mailSender',
      scope: 'global',
      columns: {
        user_id: own('userId', { type: 'string', required: true }),
        address: own('address', { type: 'string', required: true }),
        name: own('name', { type: 'string', required: false }),
        shared: own('shared', { type: 'boolean', required: true }),
        signature: own('signature', { type: 'string', required: false }),
        is_default: own('isDefault', { type: 'boolean', required: true }),
        created_at: own('createdAt', { type: 'date', required: true }),
        connection_id: own('connectionId', { type: 'string', required: false }),
        address_key: own('addressKey', { type: 'string', required: false, input: false }),
        typed_at: own('typedAt', { type: 'date', required: false }),
        listed_at: own('listedAt', { type: 'date', required: false }),
        provider_state: own('providerState', { type: 'string', required: false }),
        provider_state_read_at: own('providerStateReadAt', { type: 'date', required: false }),
        removed_at: own('removedAt', { type: 'date', required: false }),
      },
      indexes: ['mail_sender_default_idx', 'mail_sender_shared_idx', 'mail_sender_connection_address_uidx', 'mail_sender_user_address_idx'],
    },
    mail_sender_verification: {
      scope: 'global',
      columns: {
        sender_id: own('senderId', { type: 'string', required: true }),
        verifier: own('verifier', { type: 'string', required: true }),
        state: own('state', { type: 'string', required: true }),
        secret_hash: own('secretHash', { type: 'string', required: true }),
        created_at: own('createdAt', { type: 'date', required: true }),
        expires_at: own('expiresAt', { type: 'date', required: true }),
        next_check_at: own('nextCheckAt', { type: 'date', required: true }),
        settled_at: own('settledAt', { type: 'date', required: false }),
        valid_until: own('validUntil', { type: 'date', required: false }),
        error_code: own('errorCode', { type: 'string', required: false }),
        error: own('error', { type: 'string', required: false }),
      },
      indexes: [
        'mail_sender_verification_pending_uidx',
        'mail_sender_verification_secret_uidx',
        'mail_sender_verification_due_idx',
        'mail_sender_verification_expiry_idx',
        'mail_sender_verification_sender_idx',
      ],
    },
  },
} as const satisfies ModuleDeclaration
