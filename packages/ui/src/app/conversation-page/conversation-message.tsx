import type { ConversationPageModel } from '@protobase/schema'
import { ChatMessage, type ChatAuthor } from '../../chat'
import { formatDateTime } from '../../format/date'
import { MentionedText } from '../../mentions'
import type { Member } from '../../people/use-members'
import { text } from './messages'

type Props = {
  page: ConversationPageModel
  row: Record<string, unknown>
  author: ChatAuthor
  time: string | undefined
  continued: boolean
  member: (id: string) => Member | undefined
}

const idsOf = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])

/**
 * One message under its author, named after the organization's member with their id when there is one, its text with
 * the people it mentions picked out as `MentionedText` does, and "(edited)" under it once changed.
 */
export const ConversationMessage = ({ page, row, author, time, continued, member }: Props) => {
  const body = row[page.text] == null ? '' : String(row[page.text])
  const mentioned = page.mentions === undefined ? [] : idsOf(row[page.mentions]).map((id) => ({ name: member(id)?.name }))
  const edited = page.edited === undefined ? undefined : row[page.edited]
  const footer = typeof edited === 'string' && <span title={text('editedAt', { time: formatDateTime(Date.parse(edited)) })}>{text('edited')}</span>
  return (
    <ChatMessage author={{ id: author.id, name: member(author.id)?.name ?? author.name }} time={time} continued={continued} footer={footer}>
      <MentionedText text={body} mentions={mentioned} />
    </ChatMessage>
  )
}
