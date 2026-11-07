---
title: Workflow plugins
description: Add trigger and step types to workflows from a file of the app or a package, through the same public interface the built-in types use.
---

:::caution[Beta]
Plugins add step types and record triggers. They also add polling and webhook triggers, which run within the limits named in their section, and connections that sign in to other services as an account a person connected, within the limits named under [Connections](#connections).
:::

A **workflow plugin** adds trigger and step types to an app's [workflows](/reference/workflows/). Its types are named `<plugin>:<key>`, such as `acme:create_invoice`: a Task names a step type as its `Resource`, and a definition's `trigger` holds a trigger type with its input. The built-in types, `app:http`, `app:records.*`, `app:mail.send` and `app:record`, are a plugin like any other, written on this interface alone, so a plugin's types run, are checked and are listed exactly as they are. So is every [default plugin](#default-plugins), such as [incoming Gmail mail](#incoming-gmail-mail).

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

For a whole plugin to read, with a connection, a polling cursor, a refused token and bounded run input, see the Gmail plugin's source, `packages/workflow-plugins/src/gmail/` in the repository, which [the next section](#incoming-gmail-mail) describes.

`definePlugin` checks the plugin's names: its `name` is lowercase letters, digits and `_`, each type's key is lowercase words joined by `_` or `.`, and a type that names a connection must find it among the plugin's `connections`.

### Installing it

- **The app's own:** the default export of `workflows/plugins/<name>.ts`, found by its path as jobs are. An [extension](/reference/config/#extensions) adds its own from its folder.
- **From a package:** listed by name in [`workflows.plugins`](/reference/config/jobs-and-events/#workflowsplugins), its default export the plugin. The package is a dependency of the app.

Two plugins of one name stop startup, naming both. The exception is an app's own plugin named like a [default plugin](#default-plugins) other than `app`, which takes that default's place, such as one that pins its own version. A plugin is server code that runs with the app's rights, like the app's own code: load only plugins you trust. The interface's version is `pluginApi`, `1`; releases add optional keys to it and never break it.

## Step types

| Key | |
| --- | --- |
| `label`, `description` | What the type list shows, to a person and to a model. |
| `input` | The JSON Schema of the Task's `Arguments`, checked before `run`: arguments that do not fit fail the step as `<errorPrefix>.InvalidArguments`, naming the field. |
| `output` | The JSON Schema of what `run` returns, for the type list. |
| `errorPrefix`, `errors` | The prefix of its error names, `Step` by default, and the errors it fails with by name, each with what it means. |
| `connection` | The connection it signs in with, by the name the plugin declares it under. |
| `cache` | Reuses the result of an identical earlier call: see [Caching results](#caching-results). Without it the engine looks up and keeps nothing for the type, unless a workflow forces it on. |
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
| `mailbox` | `send(message)` from the [own mailbox](/reference/email/#from-someones-own-mailbox) of the person who turned on the version the run runs, signed in as themselves, while they may still change the workflow; otherwise it fails `not_linked` and sends nothing. `undefined` when the app links no mailboxes. |
| `runId`, `idempotencyKey` | The run, and a key that every retry of this visit of the step shares, while a later visit of the same state, such as in a loop, gets a new one: send it where the receiver deduplicates. |
| `signal` | Aborted at the step's timeout, or when the worker stops; pass it on to `fetch`. |
| `log(message)`, `redact(text)` | A line in the step's logs, and the text with the app's secrets blanked out, both as the runner records them. |
| `earlier`, `reuse(output)` | For a type whose cache offers hits: the earlier call's result, as [Caching results](#caching-results) says. |

### Sending requests

`fetch` resolves the URL's host once, refuses it unless every address is public, and connects to the very address it checked, so a URL built from a run's data cannot reach the app's own network or a cloud metadata address. It follows no redirect: a 3xx comes back as it is, and a plugin that follows one calls `fetch` again with the new URL, whose host is checked in turn. It reads at most `maxBytes` of the answer's body as it comes, 10 MiB by default and at most, and never decodes a `Content-Encoding`, so a large or endless answer fails with `ResponseTooLargeError` instead of filling memory; a refused address fails with `AddressRefusedError`. [`workflows.allowPrivateAddresses`](/reference/config/jobs-and-events/#workflowsallowprivateaddresses) lets it reach private addresses, for development and tests.

A plugin sends through `context.fetch`, never through the global `fetch`, Node's `http`, `https`, `net` or `tls`, or an HTTP client of its own: those are not guarded, so a workflow's data could make them reach the app's own network. The built-in plugins are held to this by the repository's boundary check, which fails on any of them.

### Caching results

:::caution[Beta]
<gap>A run cannot be replayed with its outside writes not sent and its reads served from the cache because replaying a run is not implemented.</gap>
:::

A step type can reuse the result of an identical earlier call, from any run of any workflow, so a slow or costly lookup with a small result runs once. Caching is for such steps: a quick read, such as a local file, runs faster than a lookup in the cache, and only fills the app's database. A type without `cache` costs nothing: the engine looks up, keeps and tracks nothing for it.

```ts
lookup: {
  label: 'Company lookup',
  description: 'Finds a company by its registration number.',
  input: { type: 'object', required: ['number'], properties: { number: { type: 'string' } } },
  cache: { choice: 'force', ttl: '1 day', when: (input) => input.number !== '' },
  run: async ({ input, fetch }) => (await fetch(`https://registry.example/companies/${input.number}`)).json(),
}
```

| `cache` | |
| --- | --- |
| `choice` | How much the workflow's author decides: `hidden`, nothing; `switch`, a *Cache results* switch, off unless `default` is `true`; `force`, the type decides and the author may force it on; `discouraged`, the same, with a `disclaimer` the editor shows before forcing it on, which the plugin must give. |
| `ttl` | How long a result serves: seconds, or text such as `10 minutes`, `1 hour` or `2 days`, at most 30 days; or a function of the input. A missing, zero, negative or unreadable one keeps nothing, and the step's logs say so. |
| `when(input)` | Whether this call may use the cache at all; `false` looks up and keeps nothing. A workflow that forces the cache on overrides it, except for a `switch`, whose `Cache: true` only turns it on. |
| `use` | `return` (default): a hit is the step's result, and `run` is not called. `offer`: `run` gets the earlier call as `earlier`, `{ output, cached_at, expires_at, secrets_changed }`, and decides: returning `reuse(output)`, with the earlier output as it is or cleaned, keeps the entry as it was; returning anything else is a fresh result that replaces it. `run` gets `earlier` only on a hit. |
| `key` | What a call's key covers. `reads` (default): only the input values `run` read, everything it serialised, listed or handed to `fetch` counting as read. `input`: the whole input. A function of the input: its value, as JSON; one that throws or gives nothing leaves the call uncached. Under `reads`, a value read only after `run` returned is not in the key, so a type that reads its input in a callback later uses `input`. |
| `actsAs` | `records`, as the person who saved the version, and `mailbox`, as the person who turned it on: the services a cached call may act through, each adding that person to the key. |

Two calls share a result only when their keys match and they act as the same people: the run's tenant always; the saver and the enabler where `actsAs` lists them; and the account the version binds to the type's connection, with the person who turned it on. The app reads these from the run, never from the step. A cached call of a type with a connection checks the connection before it looks up the cache, as its `accessToken()` does, so once the run may no longer use the account, the call throws its `not_connected` `ConnectionError` rather than return an earlier result, and the step fails with `States.TaskFailed`, the name a `Catch` matches. A call that used `records` or `mailbox` without listing them, or touched the run's files, which are the run's alone, runs as always and is not kept. Only a call that succeeded with a result is kept, at most 256 KiB of it as the run records it, so secrets are blanked out. Each type keeps at most 1,000 results per tenant, and the ones that expire soonest go first. A cache that cannot be read within two seconds or written leaves the step to run without it.

A workflow forces the cache on with `Cache: true` on its Task, even for a type without `cache` or with a hidden one. A type without `cache` then keys on its whole input and on every person a step can act as, and keeps a result for an hour; a type with `cache` keeps its own `ttl`, `key`, `use` and `actsAs`. A Task with `Cache: false` never uses it.

Secrets are never kept. A step always gets a secret's current value, and a key holds the secret's name where the input held its value, so changing a secret and running again calls the step with the new value whenever the old result no longer matches. A hit whose input named a secret that has changed since says so in the step's logs, and in `secrets_changed`, by a fingerprint of the value under the app's secret, `PROTOBASE_SECRET`. Without one, the app cannot tell. A cached step that decides on access, such as whether someone may do something, keeps its answer until its result expires. The results are kept in the workflows schema's `step_cache`.

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

### Polling and webhook

:::caution[Beta]
A webhook trigger that registers its own URL cannot subscribe in an app without sign-in, since it reads the app's public address from the sign-in origin, and a poll job that failed all its tries does not start polling again by itself: retry it in the admin app's failed jobs.
:::

A polling trigger asks a service for new items on a schedule:

```ts
type Order = { id: number }

triggers: {
  new_order: {
    kind: 'polling',
    label: 'New order',
    description: 'Starts a run for each new order.',
    input: { type: 'object', properties: {} },
    every: '1 minute',
    limit: 50,
    start: async ({ fetch }) => ((await (await fetch('https://shop.example/orders/latest')).json()) as Order).id,
    // At most `limit` orders after the cursor, oldest first, so a backlog is read a page per poll.
    poll: async ({ fetch, cursor, limit }) => {
      const orders = (await (await fetch(`https://shop.example/orders?after=${cursor}&sort=asc&limit=${limit}`)).json()) as Order[]
      return { items: orders.map((order) => ({ key: String(order.id), data: order })), cursor: orders.at(-1)?.id ?? cursor }
    },
  },
},
```

- **`every`** is a duration such as `1 minute` (at least a second), or `{ cron, timezone }`, or a function of the trigger's input that returns either, as `app:schedule` takes its cron from its input. `poll` gets `due`, the time the poll was queued for.
- **`start`** runs once, when the trigger has no cursor yet, and returns the first one. A new version of the workflow with the same trigger input keeps the cursor and does not call `start` again; turning the workflow off and on starts afresh.
- **`poll`** gets `limit` and returns the items after `cursor`, at most `limit` (default and most 100), each with a `key` of at most 200 characters, and the next cursor, which must move forward. Each item starts one run, once per workflow and key, with `data` as its input, so an item seen on two polls, or by two processes, starts one run. `store` keeps a value of its own across polls; the cursor and `store` hold at most 64 KiB of JSON each.
- **Errors:** a poll that throws, gives more items than its limit, or a cursor too large, starts no run: the trigger is `failing` with the error, and polls again after `every × 2ⁿ`, at most an hour; its next poll that works makes it `active`. A `ConnectionError('link_expired')` makes every trigger on that sign-in `needs_sign_in` and stops their polls. A poll may run for five minutes, when its `signal` aborts. A poll that was still running as its workflow was turned off or changed starts nothing.

A webhook trigger takes calls of the workflow's URL, [as `app:webhook` does](/reference/workflows/#appwebhook): the route checks the call's signature by the trigger's `auth` before any plugin code sees it, so spread `webhookInputProperties` from `@protobase/workflows/plugin` into the trigger's input schema. `receive({ request, event, idempotencyKey, input })` gets the call without its credentials and returns the runs it starts, at most 100, each `{ key?, data }`, and may return a `response` to answer with instead of `202`, such as a service's URL check. A trigger that registers its URL with its service itself declares `subscribe({ url, secret })`, which the app calls as the workflow is turned on with a URL it makes for the plugin alone, and returns the subscription's state; `renew` runs every `renewEvery` (default `1 day`) and `unsubscribe` as the workflow is turned off or deleted. Such a trigger has no URL to issue by hand. <gap>A webhook trigger that registers its own URL cannot subscribe in an app without sign-in because reading the app's public address from elsewhere is not implemented.</gap> <gap>A poll job that failed all its tries cannot start polling again by itself because a sweep of stopped triggers is not implemented; retrying the job in the admin app's failed jobs resumes it.</gap>

## Connections

A plugin's `connections` declare the sign-ins its types use, each under a name of lowercase letters, digits and `_`:

```ts
connections: {
  // Through one of the app's sign-in providers (auth.socialProviders), with the scopes connecting asks for:
  google: {
    label: 'Google account',
    signIn: 'google',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    link_params: { access_type: 'offline', prompt: 'consent' },
    revocation_url: 'https://oauth2.googleapis.com/revoke',
  },
  // Or through an OAuth 2.0 provider of its own, whose client the app's owner sets in auth.connections:
  account: {
    label: 'Acme account',
    scopes: ['read'],
    oauth: {
      authorization_url: 'https://acme.example/oauth/authorize',
      token_url: 'https://acme.example/oauth/token',
      user_info_url: 'https://acme.example/oauth/me',
      revocation_url: 'https://acme.example/oauth/revoke',
    },
  },
},
```

| Key | What it is |
| --- | --- |
| `label` | What the account page and the type list call it. |
| `scopes` | What connecting asks for. An account counts for the connection only while it holds every one of them. |
| `link_params` | More authorization parameters, such as those that ask for a refresh token. |
| `signIn` | One of the app's sign-in providers, whose client and endpoints it uses. |
| `oauth` | The provider's `authorization_url`, `token_url` and `user_info_url`, each required (`user_info_url` answers the account's `sub` or `id`), its `revocation_url`, and `pkce` (default `true`). |
| `revocation_url` | Where disconnecting revokes the token ([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)). Without one, disconnecting deletes it only. |

Every URL is `https`. A host given by its address, or `localhost`, is refused at startup unless `workflows.allowPrivateAddresses` is on, for development and tests. The app sends each request only to the URL the plugin declares, through the [guarded request](#sending-requests). That request resolves the host once, refuses a private address and follows no redirect, so a declaration can never send a code, a token or the client secret to the app's own network.

A type that names a connection is available once the app can make it. An `oauth` connection needs `auth.encryptOAuthTokens` and its client in `auth.connections`. A `signIn` connection needs `auth.encryptOAuthTokens` and its provider in `auth.socialProviders`. The type list gives the reason a type is not available. The client of an `oauth` connection is set by `<plugin>:<connection>`, and its redirect URI is `<baseURL>/api/auth/callback/workflow-<plugin>-<connection>`:

```ts
auth: {
  encryptOAuthTokens: true,
  connections: { 'acme:account': { clientId: process.env.ACME_CLIENT_ID!, clientSecret: process.env.ACME_CLIENT_SECRET! } },
},
```

A step or a trigger hook gets the connection its type declares as `connection`, and nothing else. It has no connection id, so a plugin cannot reach another workflow's account. `connection.accessToken()` gives a token that is valid now, refreshed first when it expired, and checks every time that the workflow may still use the account, as [Connecting an account](/reference/workflows/#connecting-an-account) says. It throws a `ConnectionError`:

- **`not_connected`:** the workflow may not use an account for the connection.
- **`link_expired`:** the provider refused the refresh, so the account's owner connects it again. A trigger that throws this waits for that sign-in.

The token is blanked out of the step's logs, error and output, and out of the trigger's error, before they are kept. A plugin never puts it in its input or output.

An account connected through a provider of a connection's own never signs anyone in to the app, and never signs anyone up. <gap>A connection cannot be shared between people of an organization because shared connections are not implemented; each account is its owner's alone.</gap>

## Default plugins

Every app has these plugins besides `app`. A type that signs in is offered once the app can make its connection, as [Connections](#connections) says.

### Incoming Gmail mail

:::caution[Beta]
The Gmail plugin is tested against a stand-in of Gmail's API written to Google's published reference, but has not yet been checked against a real Google account. Mail starts its run within about a minute of arriving, not at once.
:::

`gmail:new_mail` starts one run for each new mail on a label of a connected Gmail mailbox. It reads the mailbox with read-only access, so a workflow it starts cannot send, change or delete mail through it.

To use it, turn on Google sign-in (`auth.socialProviders.google`) with `auth.encryptOAuthTokens`, and add the scope `https://www.googleapis.com/auth/gmail.readonly` to the app's Google consent screen (Data Access), as [Send mail from Gmail](/guides/send-from-gmail/) does for its own scope. `gmail.readonly` is a restricted scope: until Google has verified the app, the consent screen warns that the app is unverified, and at most 100 people can connect. The person whose mailbox it is connects their Google account under **Connections** on the account page, binds that account in the workflow and turns the workflow on:

```json
{ "trigger": { "gmail:new_mail": { "label": "INBOX", "from": "@supplier.example", "subject": "invoice" } }, "connections": { "gmail:google": "<account id>" }, "stateMachine": { ... } }
```

| Input | What it does |
| --- | --- |
| `label` | The label to watch, by name or id. Default `INBOX`. A label the mailbox does not have fails the trigger, naming it. |
| `from` | Only mail whose sender's name or address contains this. |
| `to` | Only mail with a To or Cc recipient whose name or address contains this. |
| `subject` | Only mail whose subject contains this. |

Each filter ignores case, and a mail must pass every filter that is set. A mail without the value a filter reads, such as one with no sender, does not pass.

A run's input is the mail:

```json
{
  "message_id": "18c2f0a9d3e4b5a6",
  "thread_id": "18c2f0a9d3e4b5a6",
  "from": { "name": "Ada", "address": "ada@example.com" },
  "to": [{ "name": "Grace", "address": "grace@example.com" }],
  "cc": [],
  "subject": "Invoice 7",
  "date": "2026-11-05T10:00:00.000Z",
  "text": "Attached.",
  "html": "<p>Attached.</p>",
  "attachments": [{ "filename": "invoice-7.pdf", "content_type": "application/pdf", "size": 48213 }],
  "truncated": false
}
```

- **The values** are as the mail states them, and `null` where it states none. `html` is the sender's own markup: treat it as untrusted wherever a workflow passes it on. Attachments come as their names, types and sizes, not their content.
- **Bounds:** each value has a fixed most length, such as 1,000 characters for the subject and 128 Ki characters for `text` and for `html`, and at most 50 recipients of each kind and 50 attachments. When the mail is still too large, `html` and then `text` are left out. A mail over about 7.5 MiB, whose answer from Gmail, in base64, is then over 10 MiB, or one too deeply nested to read, gives its headers alone, with `text`, `html` and `attachments` as `null`. A NUL character, or half of a character's surrogate pair, is left out, since the database cannot store it. `truncated` is `true` whenever something was cut short or left out.
- **When it starts:** from the moment the workflow is turned on. Mail already in the mailbox starts no run.
- **Polling:** every minute, the trigger reads the mailbox's history after where it stood, at most 90 mails a poll and the rest on the next poll, so each mail starts one run and none is skipped. Every mail it reads counts toward the 90, whether or not it passes the filters. Two triggers on one mailbox share Google's quota for that mailbox. When Google no longer keeps the history after the trigger's place, which can happen after a long time off, the trigger lists the label's mail since its last full read instead, 90 a poll, and then goes on from the history. <gap>A new Gmail mail cannot start its run at once because push notices from the mailbox are not implemented; the trigger polls every minute.</gap>
- **Sign-in:** the token is refreshed when it expires. When Google refuses the refresh, or refuses the token twice in a row, the trigger waits for the account's owner to connect it again, as [Polling and webhook](#polling-and-webhook) describes.

## The type list

[`list_workflow_types`](/reference/mcp/#workflows) over MCP lists every step and trigger type the app has, built-in and plugin ones alike, as their plugins declare them: id, label, description, input and output schemas, errors, connection and a step type's cache advice (`choice`, `default` and `disclaimer`), with `available: false` and a reason for a type the app cannot run. A save, and `validate_workflow`, check a definition against the same list.
