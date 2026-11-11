/**
 * What a thread shows of its list: the error only while no message has loaded, so a failed refetch keeps the messages
 * on screen and the reader's place in them; then its loading line until the first page arrives; then the messages.
 */
export const threadState = (list: { error: unknown; isLoading: boolean; items: unknown[] }) => {
  if (list.items.length > 0) return 'messages'
  if (list.error) return 'error'
  if (list.isLoading) return 'loading'
  return 'messages'
}
