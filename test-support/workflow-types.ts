import type { WorkflowTypeList } from '@protobase/client'
import { appPlugin } from '@protobase/workflow-plugins'
import { loadPlugins, typeCatalog, typeList } from '@protobase/workflows'
import { definePlugin } from '@protobase/workflows/plugin'

/**
 * A plugin as an app's own package writes one: a trigger and a step, each with a required input, and a polling trigger
 * that signs in through a connection.
 */
export const examplePlugin = definePlugin({
  name: 'acme',
  label: 'Acme',
  connections: { mail: { label: 'Acme mail', oauth: { authorization_url: 'https://acme.test/authorize', token_url: 'https://acme.test/token' } } },
  triggers: {
    overdue: {
      kind: 'ready',
      label: 'Invoice overdue',
      description: 'Starts one run for each invoice that is overdue.',
      input: { type: 'object', required: ['days'], properties: { days: { type: 'integer', description: 'days past its due date' } } },
      ready: () => ({ resource: 'invoices' }),
    },
    inbox: {
      kind: 'polling',
      label: 'New mail',
      description: 'Starts one run for each new mail.',
      input: { type: 'object', properties: {} },
      connection: 'mail',
      every: '1 minute',
      start: async () => null,
      poll: async () => ({ items: [], cursor: null }),
    },
  },
  steps: {
    shout: {
      label: 'Shout',
      description: 'Gives the text in capitals.',
      input: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, loud: { type: 'boolean' } } },
      run: async ({ input }) => ({ text: String(input.text).toUpperCase() }),
    },
  },
})

/**
 * The type list of an app with the built-in plugin and `examplePlugin`, as the server serves it: a type that signs in
 * through a connection is not available, as this version of the app cannot make one.
 */
export const exampleWorkflowTypes: WorkflowTypeList = typeCatalog(
  typeList(loadPlugins([{ plugin: appPlugin, source: '@protobase/workflow-plugins' }, { plugin: examplePlugin, source: 'acme' }]), (type) => (type.connection ? 'It signs in through a connection, which this app cannot make yet' : undefined)),
)
