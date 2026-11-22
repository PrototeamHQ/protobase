import type { ViewModel } from '@protobase/schema'

/**
 * Why the views cannot show typing: a conversation page with `typing` on a resource that is no channel of the realtime
 * relay, or any such page without the relay, whose channels carry the typing.
 */
export const typingViewErrors = (views: readonly ViewModel[], channels: ReadonlySet<string> | undefined): string[] =>
  views.flatMap((view) => {
    const page = view.record
    if (!page || !('conversation' in page) || !page.conversation.typing) return []
    if (!channels) return [`View "${view.resource}": record.conversation.typing goes through the realtime relay, so the app needs realtime.relay`]
    return channels.has(view.resource) ? [] : [`View "${view.resource}": record.conversation.typing goes through the record's relay channel, so "${view.resource}" needs to be in realtime.relay.channels`]
  })
