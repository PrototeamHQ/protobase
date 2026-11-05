import { definePlugin } from '@protobase/workflows/plugin'

/** A plugin as an app's own package writes one: a ready trigger and a step, on the public interface alone. */
export default definePlugin({
  name: 'example',
  label: 'Example',
  triggers: {
    new_note: {
      kind: 'ready',
      label: 'New note',
      description: 'Starts one run for each new note of the resource.',
      input: { type: 'object', required: ['resource'], properties: { resource: { type: 'string' } } },
      ready: (input) => ({ resource: input.resource as string }),
    },
  },
  steps: {
    shout: {
      label: 'Shout',
      description: 'Gives the text in capitals.',
      errorPrefix: 'Example',
      input: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
      output: { type: 'object', properties: { text: { type: 'string' } } },
      run: async ({ input }) => ({ text: String(input.text).toUpperCase() }),
    },
  },
})
