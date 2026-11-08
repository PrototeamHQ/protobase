import { isApiError } from '@protobase/client'
import { refusalReason } from '../displays/board-columns'
import { text } from './messages'

/** What was refused: a move of the record titled `title`, or an undo (no title), on a list or a board. */
export type Refused = { title?: string | undefined; place: 'list' | 'board' }

/**
 * The toast of a refused move or undo. When the order changed where it was dropped (412), a warning that it was not
 * saved and that the list, which reloads by itself, shows the current order; otherwise an error with `fallback` and the
 * server's reason.
 */
export const moveRefusal = (error: unknown, fallback: string, { title, place }: Refused) => {
  if (!isApiError(error) || error.status !== 412) return { state: 'error' as const, title: fallback, description: refusalReason(error) }
  if (title === undefined) return { state: 'warning' as const, title: fallback, description: text('orderChangedSince', { place }) }
  return { state: 'warning' as const, title: text('notSaved', { title }), description: text('orderChangedThere', { place }) }
}
