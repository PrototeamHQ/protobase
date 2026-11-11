type ThreadList = { error: unknown; isLoading: boolean; items: unknown[] }

/**
 * What a thread shows of its list: the error only while no message has loaded, so a failed refetch keeps the messages
 * on screen and the reader's place in them; then its loading line until the first page arrives; then the messages.
 */
export const threadState = (list: ThreadList) => {
  if (list.items.length > 0) return 'messages'
  if (list.error) return 'error'
  if (list.isLoading) return 'loading'
  return 'messages'
}

/** Whether a failed refetch or **Load earlier messages** shows its error above the messages that stay loaded. */
export const showsErrorAbove = (list: ThreadList) => list.items.length > 0 && Boolean(list.error)

type RetryableList = { isFetchNextPageError: boolean; fetchNextPage: () => unknown; refetch: () => unknown }

/** What **Try again** runs on a thread's error: the earlier messages when loading them failed, else the thread again. */
export const retryOf = (list: RetryableList) => (list.isFetchNextPageError ? () => void list.fetchNextPage() : () => void list.refetch())
