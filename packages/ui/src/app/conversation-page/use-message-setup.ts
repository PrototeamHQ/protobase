import type { AppAddress, ConversationPageModel } from '@protobase/schema'
import type { PeopleSearch } from '../../mentions'
import { useMembers } from '../../people/use-members'
import { useAdminMeta, usePermissions } from '../meta-gate'
import type { MessageSetup } from './message-setup'
import { emojiSet } from './reactions'
import { useMessageAttachments } from './use-message-attachments'
import { useMessageReactions } from './use-message-reactions'
import { useMessageWrites } from './use-message-writes'

type Input = {
  page: ConversationPageModel
  me: string | undefined
  /** The keys of the messages shown, a list per page they were read in, whose reactions and files are read a page at a time. */
  pages: readonly (readonly string[])[]
  threadTo?: (key: string) => AppAddress
  searchPeople?: PeopleSearch
}

/** The `MessageSetup` of the messages shown, with their reactions and files read, and the errors of those reads, if any. */
export const useMessageSetup = ({ page, me, pages, threadTo, searchPeople }: Input) => {
  const { resources } = useAdminMeta()
  const { member } = useMembers()
  const writes = useMessageWrites(page)
  const messagePermissions = usePermissions(page.resource)
  const reactionPermissions = usePermissions(page.reactions?.resource ?? page.resource)
  const reactions = useMessageReactions(page.reactions, pages)
  const files = useMessageAttachments(page.attachments, pages)
  const values = page.reactions ? (resources[page.reactions.resource]?.fields[page.reactions.emoji]?.enumValues ?? []) : []
  const setup: MessageSetup = {
    page,
    me,
    member,
    writes,
    emoji: page.reactions ? emojiSet(page.reactions, values) : [],
    messagePermissions,
    reactionPermissions,
    reactionsOf: (key) => reactions.byMessage.get(key) ?? [],
    attachmentsOf: (key) => files.byMessage.get(key) ?? [],
    threadTo,
    searchPeople,
  }
  return { setup, reactionsError: reactions.error, attachmentsError: files.error }
}
