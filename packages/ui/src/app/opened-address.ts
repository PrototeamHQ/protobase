import type { AppAddress } from '@protobase/schema'
import { addressPlaceholders, fillAddress } from '@protobase/schema/internal'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/**
 * The address a record's page opens in its place: the first of `choices` whose `{{field}}`s all have a value in the
 * record, filled from it, as a row button picks its choice. None when no choice fits, such as a workflow run of no
 * workflow, so the record's own page shows instead.
 */
export const openedAddress = (choices: readonly AppAddress[], record: Record<string, unknown>): AppAddress | undefined => {
  const choice = choices.find((to) => !addressPlaceholders(to).some((name) => isEmpty(record[name])))
  return choice && fillAddress(choice, record)
}
