import { isApiError } from '@protobase/client'
import { refusalReason } from '../displays/board-columns'
import { text } from './messages'

/**
 * What a toast says of a refused move: when the list changed where it was dropped, that the list now shows the current
 * order, which it reloads by itself; otherwise `title` and the server's reason.
 */
export const moveRefusal = (error: unknown, title: string) =>
  isApiError(error) && error.status === 412 ? { title: text('listChanged'), description: text('listChangedHint') } : { title, description: refusalReason(error) }
