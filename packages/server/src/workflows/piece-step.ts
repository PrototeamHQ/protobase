import { StepError, type TaskHandler } from '@protobase/workflows'

/**
 * The `app:piece` step, which a definition may name but which runs no piece yet: it fails with `Piece.Error` until the
 * app's plugins give it a handler that sends through the plugin context's guarded fetch.
 */
export const pieceStep: TaskHandler = async () => {
  throw new StepError('Piece.Error', 'No piece runs in this app yet')
}
