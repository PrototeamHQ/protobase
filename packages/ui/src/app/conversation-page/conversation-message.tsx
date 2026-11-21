import { useState } from 'react'
import { ChatMessage, type ChatAuthor } from '../../chat'
import { formatDateTime } from '../../format/date'
import { cn } from '../../lib/cn'
import { MentionedText } from '../../mentions'
import { buttonClass } from '../../primitives/button'
import { DeleteMessageDialog } from './delete-message-dialog'
import { MessageActionsBar } from './message-actions-bar'
import { MessageActionsSheet } from './message-actions-sheet'
import { MessageAttachments } from './message-attachments'
import { MessageEditor } from './message-editor'
import type { MessageSetup } from './message-setup'
import { ReactionChips } from './reaction-chips'
import { ThreadSummary } from './thread-summary'
import { useMessageControls } from './use-message-controls'
import { useMessagePress } from './use-message-press'
import { text } from './messages'

type Props = {
  setup: MessageSetup
  row: Record<string, unknown>
  /** The message's key, as text. */
  messageKey: string
  author: ChatAuthor
  time: string | undefined
  continued: boolean
}

const idsOf = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])

/**
 * One message under its author, named after the organization's member with their id when there is one: its text with
 * the people it mentions picked out as `MentionedText` does, or a box to change it while its author edits it; its files;
 * in the conversation itself its thread's replies; and a footer of "(edited)" once changed and its reactions. What the reader
 * can do to it shows in a bar while they point at it, or, by touch, in a sheet a tap or long-press opens, which also
 * copies its text; a button only a keyboard or screen reader reaches opens that sheet on a touch screen too.
 */
export const ConversationMessage = ({ setup, row, messageKey, author, time, continued }: Props) => {
  const { page, me, member } = setup
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [acting, setActing] = useState(false)
  const press = useMessagePress(() => setActing(true))
  const body = row[page.text] == null ? '' : String(row[page.text])
  const mine = me !== undefined && author.id === me
  const name = member(author.id)?.name ?? author.name
  const files = setup.attachmentsOf(messageKey)
  const mentionIds = page.mentions === undefined ? [] : idsOf(row[page.mentions])
  const controls = useMessageControls(setup, { row, key: messageKey, mine, body, onEdit: () => setEditing(true), onDelete: () => setDeleting(true) })
  const edited = page.edited === undefined ? undefined : row[page.edited]
  const replies = page.thread && setup.threadTo ? Number(row[page.thread.count] ?? 0) : 0
  const last = page.thread && typeof row[page.thread.last] === 'string' ? (row[page.thread.last] as string) : undefined
  const chips = controls.groups.length > 0 && <ReactionChips groups={controls.groups} member={member} onReact={controls.onReact} onUnreact={controls.onUnreact} />
  const footer = (typeof edited === 'string' || chips) && (
    <span className="flex flex-wrap items-center gap-1">
      {typeof edited === 'string' && <span title={text('editedAt', { time: formatDateTime(Date.parse(edited)) })}>{text('edited')}</span>}
      {chips}
    </span>
  )
  const title = mine ? text('yourMessage') : name ? text('messageFrom', { name }) : text('message')
  const showLabel = mine ? text('showYourActions') : name ? text('showActionsFrom', { name }) : text('showActions')
  return (
    <>
      <div
        data-message={messageKey}
        className={cn('group relative rounded-md [@media(hover:none)]:select-none [@media(hover:none)]:[-webkit-touch-callout:none] [&_a]:[-webkit-touch-callout:default]', acting && 'bg-muted')}
        {...(!editing && press)}
      >
        {!editing && <MessageActionsBar controls={controls} />}
        {!editing && (
          // On a touch screen, the way in for a screen reader or a keyboard, out of sight until it has the focus
          <button
            type="button"
            className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-0 focus-visible:top-0 focus-visible:z-10 [@media(hover:hover)]:hidden')}
            onClick={() => setActing(true)}
          >
            {showLabel}
          </button>
        )}
        <ChatMessage author={{ id: author.id, name }} time={time} continued={continued} footer={footer}>
          {editing ? (
            <MessageEditor
              body={body}
              picked={mentionIds.flatMap((id) => (member(id) ? [{ id, name: member(id)!.name }] : []))}
              searchPeople={setup.searchPeople}
              onSave={(changed, mentions) => setup.writes.edit(messageKey, changed, mentions)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            body !== '' && <MentionedText text={body} mentions={mentionIds.map((id) => ({ name: member(id)?.name }))} />
          )}
          {files.length > 0 && <MessageAttachments attachments={files} />}
          {replies > 0 && controls.thread && <ThreadSummary count={replies} last={last} to={controls.thread} />}
        </ChatMessage>
      </div>
      {deleting && (
        <DeleteMessageDialog
          onClose={() => setDeleting(false)}
          onDelete={() => {
            setDeleting(false)
            void setup.writes.remove(messageKey, files)
          }}
        />
      )}
      {acting && !editing && <MessageActionsSheet controls={controls} title={title} preview={body} onClose={() => setActing(false)} />}
    </>
  )
}
