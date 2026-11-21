import { useQueries } from '@tanstack/react-query'
import type { ReactionsModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { reactionsFilter, readReactions } from './conversation-reads'
import { reactionsByMessage } from './reactions'

/**
 * The reactions to the messages shown, read in one batch per page of messages, never one read per message, and read
 * again as they change: `byMessage` holds each message's reaction rows by its key. Without reactions, nothing is read.
 */
export const useMessageReactions = (reactions: ReactionsModel | undefined, pages: readonly (readonly string[])[]) => {
  const client = useClient()
  const results = useQueries({
    queries: (reactions ? pages.filter((page) => page.length > 0) : []).map((page) => ({
      queryKey: keys.reactionsOf(reactions!.resource, reactionsFilter(reactions!, page)),
      queryFn: () => readReactions(client, reactions!, page),
    })),
  })
  const rows = results.flatMap((result) => result.data ?? [])
  return { byMessage: reactionsByMessage(rows, reactions?.field ?? ''), error: results.find((result) => result.error)?.error ?? undefined }
}
