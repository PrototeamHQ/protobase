import { field, own, type ModuleDeclaration } from '../declaration'

/** Passkeys, each with the RP ID it was made for. */
export const passkeys = {
  id: 'passkeys',
  requires: ['auth'],
  tables: {
    passkey: {
      model: 'passkey',
      scope: 'global',
      columns: {
        name: field('name'),
        public_key: field('publicKey'),
        user_id: field('userId'),
        credential_id: field('credentialID'),
        counter: field('counter'),
        device_type: field('deviceType'),
        backed_up: field('backedUp'),
        transports: field('transports'),
        created_at: field('createdAt'),
        aaguid: field('aaguid'),
        // Its default, the passkey domain, is the plugin's.
        rp_id: own('rpID', { type: 'string', required: false, input: false }),
      },
      indexes: ['passkey_user_id_idx', 'passkey_credential_id_idx', 'passkey_rp_id_idx'],
    },
  },
} as const satisfies ModuleDeclaration
