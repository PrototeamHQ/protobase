import type { WorkflowTypeList } from '@protobase/client'
import { appPlugin } from '@protobase/workflow-plugins'
import { connectionUnavailable, loadPlugins, typeCatalog, typeList } from '@protobase/workflows'
import { definePlugin } from '@protobase/workflows/plugin'

/**
 * A plugin as an app's own package writes one: a trigger and a step, each with a required input, a polling trigger
 * that signs in through an OAuth provider of its own, and a step that signs in through the app's Google sign-in.
 */
export const examplePlugin = definePlugin({
  name: 'acme',
  label: 'Acme',
  connections: {
    google: { label: 'Google account', signIn: 'google', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] },
    mail: { label: 'Acme mail', oauth: { authorization_url: 'https://acme.test/authorize', token_url: 'https://acme.test/token', user_info_url: 'https://acme.test/me' } },
  },
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
    labels: {
      label: 'Mail labels',
      description: 'Lists the labels of the connected Google mailbox.',
      input: { type: 'object', properties: {} },
      connection: 'google',
      run: async () => ({ labels: [] }),
    },
  },
})

/**
 * What the example app connects accounts with, as the server reads it from `auth`: its Google sign-in, with encrypted
 * tokens, and no OAuth client for `acme:mail`.
 */
export const exampleConnectionSupport = { encrypted: true, signInProviders: ['google'], clients: [] }

/**
 * The type list of an app with the built-in plugin and `examplePlugin`, as the server serves it, by the server's own
 * rule: `acme:labels` signs in through Google, which the app has, while `acme:inbox` is not available, as the app sets
 * no client for its connection.
 */
export const exampleWorkflowTypes: WorkflowTypeList = typeCatalog(
  typeList(loadPlugins([{ plugin: appPlugin, source: '@protobase/workflow-plugins' }, { plugin: examplePlugin, source: 'acme' }]), connectionUnavailable(exampleConnectionSupport)),
)
