import type { Planned } from '../pages/planned'

/** What a thread draws of one of its lists, its messages or its tool calls, as `useList` gives it. */
export type ThreadList = {
  items: Record<string, unknown>[]
  labels: Record<string, Record<string, string>>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isLoading: boolean
  error: Error | null
  fetchNextPage: () => unknown
  refetch: () => unknown
}

type State = {
  /** The latest records the page's planned read holds for it, inside the records of another block. */
  planned: Planned | undefined
  /** How many the planned read gives each record at most: as many mean earlier ones may be left. */
  limit: number
  /** Whether earlier records were asked for, so it reads its pages itself from then on. */
  expanded: boolean
  expand: () => void
  /** Its own read, which reads nothing until it is expanded when planned. */
  own: ThreadList & { pages: number }
}

/**
 * The list a thread draws: the planned latest records until earlier ones are asked for, which its own read then gives
 * from its first page and the one after it, the planned records staying while it reads them; its own read without one.
 */
export const threadListOf = ({ planned, limit, expanded, expand, own }: State): ThreadList => {
  if (!planned) return own
  const reading = expanded && !own.error && own.pages < 2 && (own.pages === 0 || own.hasNextPage)
  if (expanded && !reading) return own
  return {
    items: planned.rows,
    labels: planned.labels ?? {},
    hasNextPage: planned.rows.length >= limit,
    isFetchingNextPage: reading,
    isFetchNextPageError: false,
    isLoading: planned.isPending,
    error: planned.error,
    fetchNextPage: expand,
    // A planned read that failed is read again as its own
    refetch: expand,
  }
}
