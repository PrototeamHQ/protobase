import type { ResourcePermissions } from '@protobase/client'
import type { AppAddress, ConversationPageModel } from '@protobase/schema'
import type { PeopleSearch } from '../../mentions'
import type { Member } from '../../people/use-members'
import type { Attachment } from './attachments'
import type { EmojiEntry } from './reactions'
import type { useMessageWrites } from './use-message-writes'

/**
 * What every message of a conversation, or of a thread beside it, needs beyond its own row: the page, the reader, the
 * organization's members, the writes, the emoji offered, the access to messages and reactions, each message's
 * reactions and files by its key, `threadTo` for a message of the conversation itself, whose thread opens at that address, and
 * the people `@` lists while editing.
 */
export type MessageSetup = {
  page: ConversationPageModel
  me: string | undefined
  member: (id: string) => Member | undefined
  writes: ReturnType<typeof useMessageWrites>
  emoji: readonly EmojiEntry[]
  messagePermissions: ResourcePermissions
  reactionPermissions: ResourcePermissions
  reactionsOf: (key: string) => readonly Record<string, unknown>[]
  attachmentsOf: (key: string) => readonly Attachment[]
  threadTo?: (key: string) => AppAddress
  searchPeople?: PeopleSearch
}
