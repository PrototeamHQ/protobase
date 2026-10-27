import { useCallback, useState, type KeyboardEvent } from 'react'
import { useClient } from '../../data/api-provider'
import { emptyDraft, MentionBox, mentionedIds, type MentionDraft } from '../../mentions'
import { Button } from '../../primitives/button'
import { useToast } from '../../toasts/toast-provider'
import { useNavigationGuard } from '../router'
import { refusalReason } from '../displays/board-columns'
import { usePostComment } from './use-post-comment'
import { text } from './messages'

/**
 * The box a comment is written in. Typing `@` lists the people who may read the record by the name typed after it
 * (see `MentionBox`). ⌘/Ctrl+Enter or the button posts.
 */
export const CommentComposer = ({ resource, recordKey }: { resource: string; recordKey: string }) => {
  const [draft, setDraft] = useState<MentionDraft>(emptyDraft)
  const client = useClient()
  const toast = useToast()
  const post = usePostComment(resource, recordKey)
  const searchPeople = useCallback((query: string) => client.mentionable(resource, recordKey, query), [client, resource, recordKey])
  // A comment being written, or posted, is gone when the page is left
  useNavigationGuard(draft.text.trim() !== '' || post.isPending, 'input-lost')

  const submit = () => {
    if (draft.text.trim() === '' || post.isPending) return
    post.mutate(
      { body: draft.text, mentions: mentionedIds(draft.text, draft.picked) },
      {
        onSuccess: () => setDraft(emptyDraft),
        onError: (error) => toast.show({ state: 'error', title: text('couldNotPost'), description: refusalReason(error) }),
      },
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    submit()
  }

  return (
    <div className="flex flex-col gap-2">
      <MentionBox aria-label={text('comment')} placeholder={text('placeholder')} value={draft} onChange={setDraft} searchPeople={searchPeople} onKeyDown={onKeyDown} />
      <div>
        <Button variant="primary" size="sm" disabled={draft.text.trim() === ''} loading={post.isPending} onClick={submit}>
          {text('comment')}
        </Button>
      </div>
    </div>
  )
}
