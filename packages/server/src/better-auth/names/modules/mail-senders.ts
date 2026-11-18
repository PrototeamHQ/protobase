import { own, type ModuleDeclaration } from '../declaration'

/** The From addresses people enter for the mailbox they linked: one row per person and address. */
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
      },
      indexes: ['mail_sender_default_idx', 'mail_sender_shared_idx'],
    },
  },
} as const satisfies ModuleDeclaration
