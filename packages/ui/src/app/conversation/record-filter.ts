import { createWhere, printFilter } from '@protobase/schema'

const where = createWhere()

/** The filter that finds a record's messages: those whose relation `field` holds its key. */
export const recordMessagesFilter = (field: string, recordKey: string) => printFilter(where.eq(field, recordKey))
