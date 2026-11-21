import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The index verifications are found by the start of their identifier, as the app invitations are listed. */
export const verificationPatternIndex: Step = {
  step: 4,
  name: 'verification_pattern_index',
  version: 13,
  title: 'The index that finds app invitations',
  tables: [],
  statements: ({ table }) => {
    const verification = table('verification')
    return [ddl`create index ${verification.index('verification_identifier_pattern_idx')} on ${verification} (${verification.columns.identifier} text_pattern_ops)`]
  },
}
