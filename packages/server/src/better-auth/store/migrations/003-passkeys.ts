import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Passkeys, each with the RP ID it was made for. */
export const passkeys: StoreMigration = {
  version: 3,
  name: 'passkeys',
  title: "The users' passkeys",
  tables: ['passkey'],
  statements: ({ table, user, id, idRef }) => [
    ddl`create table ${table('passkey')} (
  id ${id} primary key,
  name text,
  public_key text not null,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  credential_id text not null,
  counter integer not null,
  device_type text not null,
  backed_up boolean not null,
  transports text,
  created_at timestamptz,
  aaguid text,
  rp_id text
)`,
    ddl`create index passkey_user_id_idx on ${table('passkey')} (user_id)`,
    ddl`create index passkey_credential_id_idx on ${table('passkey')} (credential_id)`,
  ],
}
