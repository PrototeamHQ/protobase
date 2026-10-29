import { heldStatus, statusTextProblem, type Availability, type PersonStatus, type StatusInput } from '@protobase/schema/internal'
import { clearTimeOf, localInputValue, type ClearChoice } from './clear-time'

/** What the picker holds while the person chooses: the text as typed, and the clear time as a choice. */
export type StatusDraft = { availability: Availability; text: string; clears: ClearChoice; custom: string }

/** The picker's start: the person's status that holds now, its clear time as a date and time; automatic and never without one. */
export const draftOf = (status: Pick<PersonStatus, 'availability' | 'text' | 'clearsAt'> | null | undefined, now = Date.now()): StatusDraft => {
  const held = heldStatus(status, now)
  if (!held) return { availability: 'automatic', text: '', clears: 'never', custom: '' }
  return { availability: held.availability, text: held.text ?? '', clears: held.clearsAt === null ? 'never' : 'custom', custom: held.clearsAt === null ? '' : localInputValue(held.clearsAt) }
}

/**
 * The status the draft sets at `now`, or what is wrong with it: a text the server refuses (see `statusTextProblem`), or
 * a date and time that is missing or already passed. The text is trimmed, and an empty one is none.
 */
export const pickedStatus = (draft: StatusDraft, now: Date): { input: StatusInput } | { problem: 'text' | 'time'; message?: string } => {
  const text = draft.text.trim()
  const textProblem = text === '' ? undefined : statusTextProblem(text)
  if (textProblem) return { problem: 'text', message: textProblem }
  const clearsAt = clearTimeOf(draft.clears, now, draft.custom)
  if (clearsAt === undefined || (clearsAt !== null && Date.parse(clearsAt) <= now.getTime())) return { problem: 'time' }
  return { input: { availability: draft.availability, text: text === '' ? null : text, clearsAt } }
}
