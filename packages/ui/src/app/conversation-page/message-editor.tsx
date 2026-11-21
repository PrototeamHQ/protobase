import { useState, type KeyboardEvent } from 'react'
import { MentionBox, mentionedIds, type MentionDraft, type PeopleSearch, type PickedUser } from '../../mentions'
import { Button } from '../../primitives/button'
import { text } from './messages'

type Props = {
  /** The message's text as it is. */
  body: string
  /** The people it mentions, by id and name, kept while their `@name` stays in the text. */
  picked: PickedUser[]
  /** Finds the people `@` lists; without it, `@` is plain text. */
  searchPeople?: PeopleSearch
  /** Resolves true once saved; false leaves the box open, as the server refused it. */
  onSave: (body: string, mentions: string[]) => Promise<boolean>
  onCancel: () => void
}

/**
 * A message's text in a box to change it, its mentions kept while their `@name` stays: Enter or Save keeps the trimmed
 * text, Shift+Enter starts a new line, Escape or Cancel leaves it as it was. An empty text is no edit: deleting is.
 */
export const MessageEditor = ({ body, picked, searchPeople, onSave, onCancel }: Props) => {
  const [draft, setDraft] = useState<MentionDraft>({ text: body, picked })
  const [saving, setSaving] = useState(false)
  const trimmed = draft.text.trim()
  const save = async () => {
    if (trimmed === '' || saving) return
    if (trimmed === body) return onCancel()
    setSaving(true)
    const saved = await onSave(trimmed, mentionedIds(trimmed, draft.picked))
    setSaving(false)
    if (saved) onCancel()
  }
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') return onCancel()
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void save()
  }
  return (
    <div className="flex flex-col gap-2 whitespace-normal">
      <MentionBox value={draft} onChange={setDraft} searchPeople={searchPeople} onKeyDown={keys} aria-label={text('editMessage')} autoFocus />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={trimmed === ''} loading={saving} onClick={() => void save()}>
          {text('save')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {text('cancel')}
        </Button>
      </div>
    </div>
  )
}
