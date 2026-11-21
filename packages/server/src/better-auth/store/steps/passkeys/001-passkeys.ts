import { ddl } from '../../ddl'
import type { Step } from '../step'

/** Passkeys, each with the RP ID it was made for. */
export const passkeys: Step = {
  step: 1,
  version: 3,
  name: 'passkeys',
  title: "The users' passkeys",
  tables: ['passkey'],
  statements: ({ table, user, id, idRef }) => {
    const passkey = table('passkey')
    const p = passkey.columns
    return [
      ddl`create table ${passkey} (
  id ${id} primary key,
  ${p.name} text,
  ${p.public_key} text not null,
  ${p.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${p.credential_id} text not null,
  ${p.counter} integer not null,
  ${p.device_type} text not null,
  ${p.backed_up} boolean not null,
  ${p.transports} text,
  ${p.created_at} timestamptz,
  ${p.aaguid} text,
  ${p.rp_id} text
)`,
      ddl`create index ${passkey.index('passkey_user_id_idx')} on ${passkey} (${p.user_id})`,
      ddl`create index ${passkey.index('passkey_credential_id_idx')} on ${passkey} (${p.credential_id})`,
    ]
  },
}
