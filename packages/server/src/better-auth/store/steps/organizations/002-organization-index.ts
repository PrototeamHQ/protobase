import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The index organizations are paged through by, in the order they were made. */
export const organizationIndex: Step = {
  step: 2,
  name: 'organization_index',
  version: 13,
  title: 'The index that pages through the organizations',
  tables: [],
  statements: ({ table }) => {
    const organization = table('organization')
    return [ddl`create index ${organization.index('organization_created_at_id_idx')} on ${organization} (${organization.columns.created_at}, id)`]
  },
}
