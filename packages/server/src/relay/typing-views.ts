import type { ViewModel } from '@protobase/schema'

/**
 * Why the views cannot show typing: with the realtime relay, which then carries the typing, a conversation page with
 * `typing` on a resource that is no channel of the relay. Without the relay, the record's own channel carries it.
 */
export const typingViewErrors = (views: readonly ViewModel[], channels: ReadonlySet<string> | undefined): string[] =>
  views.flatMap((view) => {
    const page = view.record
    if (!channels || !page || !('conversation' in page) || !page.conversation.typing) return []
    return channels.has(view.resource) ? [] : [`View "${view.resource}": record.conversation.typing goes through the record's relay channel, so "${view.resource}" needs to be in realtime.relay.channels, or its conversation page needs members`]
  })
