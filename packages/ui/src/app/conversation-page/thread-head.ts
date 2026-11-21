/** Whether the thread's first message, `row`, is one of the conversation of the record keyed `recordKey`. */
export const inConversation = (row: Record<string, unknown>, field: string, recordKey: string) => row[field] != null && String(row[field]) === recordKey
