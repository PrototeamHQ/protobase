import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The index passkeys are found by their RP ID, as a sign-in asks which hosts hold one. */
export const rpIdIndex: Step = {
  step: 2,
  name: 'rp_id_index',
  version: 13,
  title: 'The index that finds passkeys by RP ID',
  tables: [],
  statements: ({ table }) => {
    const passkey = table('passkey')
    return [ddl`create index ${passkey.index('passkey_rp_id_idx')} on ${passkey} (${passkey.columns.rp_id})`]
  },
}
