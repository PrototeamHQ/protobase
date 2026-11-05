---
title: Workflow plugins
description: Add trigger and step types to workflows from a file of the app or a package, through the same public interface the built-in types use.
---

:::caution[Beta]
Plugins add step types and record triggers. Polling and webhook triggers, and connections that sign in to other services, are declared by the interface but not run yet.
:::

A **workflow plugin** adds trigger and step types to an app's [workflows](/reference/workflows/). Its types are named `<plugin>:<key>`, such as `acme:create_invoice`: a Task names a step type as its `Resource`, and a definition's `trigger` holds a trigger type with its input. The built-in types, `app:http`, `app:records.*`, `app:mail.send` and `app:record`, are a plugin like any other, written on this interface alone, so a plugin's types run, are checked and are listed exactly as they are.

## Writing a plugin

```ts
// workflows/plugins/acme.ts
import { definePlugin, StepError } from '@protobase/workflows/plugin'

export default definePlugin({
  name: 'acme',
  label: 'Acme',
  steps: {
    create_invoice: {
      label: 'Create an invoice',
      description: 'Creates an invoice at Acme for a customer.',
      errorPrefix: 'Acme',
      errors: { Refused: 'Acme refused the invoice; its answer is in the cause' },
      input: {
        type: 'object',
        required: ['customer', 'amount'],
        properties: { customer: { type: 'string' }, amount: { type: 'number', minimum: 0 } },
      },
      output: { type: 'object', properties: { id: { type: 'string' } } },
      run: async ({ input, fetch, signal, redact, idempotencyKey }) => {
        const answer = await fetch('https://api.acme.example/invoices', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
          body: JSON.stringify(input),
          signal,
        })
        if (!answer.ok) throw new StepError('Acme.Refused', `${answer.status}: ${redact(await answer.text()).slice(0, 200)}`)
        return { id: ((await answer.json()) as { id: string }).id }
      },
    },
  },
})
```

`definePlugin` checks the plugin's names: its `name` is lowercase letters, digits and `_`, each type's key is lowercase words joined by `_` or `.`, and a type that names a connection must find it among the plugin's `connections`.

### Installing it

- **The app's own:** the default export of `workflows/plugins/<name>.ts`, found by its path as jobs are. An [extension](/reference/config/#extensions) adds its own from its folder.
- **From a package:** listed by name in [`workflows.plugins`](/reference/config/jobs-and-events/#workflowsplugins), its default export the plugin. The package is a dependency of the app.

Two plugins of one name stop startup, naming both. A plugin is server code that runs with the app's rights, like the app's own code: load only plugins you trust. The interface's version is `pluginApi`, `1`; releases add optional keys to it and never break it.

## Step types

| Key | |
| --- | --- |
| `label`, `description` | What the type list shows, to a person and to a model. |
| `input` | The JSON Schema of the Task's `Arguments`, checked before `run`: arguments that do not fit fail the step as `<errorPrefix>.InvalidArguments`, naming the field. |
| `output` | The JSON Schema of what `run` returns, for the type list. |
| `errorPrefix`, `errors` | The prefix of its error names, `Step` by default, and the errors it fails with by name, each with what it means. |
| `connection` | The connection it signs in with, by the name the plugin declares it under. |
| `run(context)` | Returns the step's result. It throws a `StepError` to fail with an error name of its own; any other error is `States.TaskFailed`. |

What `run` gets, and nothing more:

| | |
| --- | --- |
| `input` | The Task's evaluated `Arguments`, checked. |
| `fetch(url, init)` | The only way a plugin should send a request: see [Sending requests](#sending-requests). |
| `records` | `create`, `createMany`, `update`, `get` and `list` of the app's records, through the API as the user who saved the version the run runs, with the roles they hold now: their access rules, tenant, validation and write hooks apply. A refusal fails the step with `Records.Refused`. |
| `files` | `keep(bytes, name, type)` stores a file of the run and returns its file value; `read(value, field)` reads one the run kept. No other file of the app is reachable. |
| `mail` | `send(message)` from the app's own sender; `undefined` when the app sends no mail. |
| `connection` | `accessToken()` of the connection the step declares, or `undefined`. |
| `runId`, `idempotencyKey` | The run, and a key that is the same for every try of this step in this run: send it where the receiver deduplicates. |
| `signal` | Aborted at the step's timeout, or when the worker stops; pass it on to `fetch`. |
| `log(message)`, `redact(text)` | A line in the step's logs, and the text with the app's secrets blanked out, both as the runner records them. |

### Sending requests

`fetch` resolves the URL's host once, refuses it unless every address is public, and connects to the very address it checked, so a URL built from a run's data cannot reach the app's own network or a cloud metadata address. It follows no redirect: a 3xx comes back as it is, and a plugin that follows one calls `fetch` again with the new URL, whose host is checked in turn. It reads at most `maxBytes` of the answer's body as it comes, 10 MiB by default and at most, and never decodes a `Content-Encoding`, so a large or endless answer fails with `ResponseTooLargeError` instead of filling memory; a refused address fails with `AddressRefusedError`. [`workflows.allowPrivateAddresses`](/reference/config/jobs-and-events/#workflowsallowprivateaddresses) lets it reach private addresses, for development and tests.

A plugin sends through `context.fetch`, never through the global `fetch`, Node's `http`, `https`, `net` or `tls`, or an HTTP client of its own: those are not guarded, so a workflow's data could make them reach the app's own network. The built-in plugins are held to this by the repository's boundary check, which fails on any of them.

## Trigger types

A trigger type has a `label`, a `description`, an `input` schema that a save checks the trigger's input against, an optional `check(input)` for what a schema cannot say, and a `kind`.

### Ready

```ts
triggers: {
  overdue: {
    kind: 'ready',
    label: 'Overdue invoice',
    description: 'Starts a run for each invoice three days past its due date.',
    input: { type: 'object', properties: {} },
    ready: () => ({ resource: 'invoices', when: "status = 'sent' AND due_at <= now() - 3d", key: ['due_at'] }),
  },
},
```

`ready(input)` returns the resource, the readiness filter `when` and the `key` fields, and the engine runs it as it runs [`app:record`](/reference/workflows/#apprecord): one run per record that becomes ready, at the time its time terms say, read as the user who saved the enabled version.

### Polling and webhook (coming soon)

The interface declares `kind: 'polling'`, with `every`, `limit`, `start` and `poll`, and `kind: 'webhook'`, with `receive` and the optional `subscribe`, `unsubscribe` and `renew`. <gap>A plugin's polling or webhook trigger cannot start runs because the polling and webhook triggers are not implemented; the type list marks them unavailable.</gap>

## Connections (coming soon)

`connections` declares the sign-ins a plugin's types use: one of the app's sign-in providers by name (`signIn`), or an OAuth provider of its own (`oauth`), with the `scopes` it asks for. A step or trigger names one as its `connection`, and gets only that one, through the workflow's own binding: the context takes no connection id, so a plugin cannot reach another workflow's sign-in. <gap>A type that declares a connection cannot run because connections are not implemented; the type list marks it unavailable, and a save that uses it is refused.</gap>

## The type list

[`list_workflow_types`](/reference/mcp/#workflows) over MCP lists every step and trigger type the app has, built-in and plugin ones alike, as their plugins declare them: id, label, description, input and output schemas, errors and connection, with `available: false` and a reason for a type the app cannot run. A save, and `validate_workflow`, check a definition against the same list.
