import { StepError, type StepType } from '@protobase/workflows/plugin'

/**
 * `app:piece`, which a definition may name but which runs no piece yet: it fails with `Piece.Error` until a plugin gives
 * connectors a handler that sends through the plugin context's guarded fetch.
 */
export const pieceSteps: Record<string, StepType> = {
  piece: {
    label: 'Connector action',
    description: 'Runs an action of a connector. Not implemented yet: a run fails it.',
    errorPrefix: 'Piece',
    input: {
      type: 'object',
      required: ['piece', 'action', 'connection'],
      properties: {
        piece: { description: "the connector's name" },
        action: { description: 'one of its actions' },
        connection: { description: 'the connection holding its sign-in' },
        props: { description: "the action's arguments, by name" },
      },
    },
    output: { description: 'what the action returns' },
    errors: { Error: 'always, until connectors are implemented' },
    run: async () => {
      throw new StepError('Piece.Error', 'No piece runs in this app yet')
    },
  },
}
