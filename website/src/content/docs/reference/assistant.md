---
title: Assistant
description: The chat beside the admin, its built-in backend on an OpenAI-compatible model, the protocol any backend speaks, and the building blocks to write one.
---

The admin app can show an assistant: an **Assistant** button at the end of the top bar opens a chat beside the page. The app only draws what a backend sends and sends back what the user types and clicks; the backend decides everything else. Protobase ships one backend, built in, which answers questions about the app, reads its data and proposes changes the user approves. Another backend can take its place by URL.

## Who sees it

`/api/meta` names the backend as `assistant: { url }`, and only for a caller with the `admin` or `ai` role. The app shows the button when `/meta` has it, so without a backend, or for anyone else, nothing shows. Give someone the assistant without making them an admin by adding `ai` to the project's roles (`createAuth({ roles: ['admin', 'ai', ...] })`, see [Roles](/reference/auth/#roles)) and to their user (`protobase users set-role me@example.com sales,ai`).

The built-in backend checks the role again on every request.

## Which backend

| Set | `/meta` names |
| --- | --- |
| `PROTOBASE_ASSISTANT_URL` | that URL: a backend elsewhere, such as a hosted one |
| otherwise `PROTOBASE_ASSISTANT_API_KEY` | `/api/assistant`, the built-in backend |
| neither | no assistant |

Each variable can also be set in code, as `options.assistant` of `createAdmin` (in `protobase.config.ts`, `export default { ..., options: { assistant: { ... } } }`), which wins over the variable. `assistant: false` turns the assistant off whatever the environment says. A value that is no `http(s)` URL stops the server at startup.

| Variable | Option | |
| --- | --- | --- |
| `PROTOBASE_ASSISTANT_URL` | `url` | an external backend |
| `PROTOBASE_ASSISTANT_API_KEY` | `apiKey` | the model endpoint's API key; turns on the built-in backend |
| `PROTOBASE_ASSISTANT_MODEL` | `model` | the model; default `openrouter/auto` on OpenRouter, required elsewhere |
| `PROTOBASE_ASSISTANT_BASE_URL` | `baseUrl` | an OpenAI-compatible endpoint; default `https://openrouter.ai/api/v1` |

### With OpenRouter

Create a key at [openrouter.ai](https://openrouter.ai/keys) and set it, with a model of your choice:

```sh
PROTOBASE_ASSISTANT_API_KEY=sk-or-v1-...
PROTOBASE_ASSISTANT_MODEL=anthropic/claude-sonnet-5.5   # optional; OpenRouter picks one without it
```

### With another OpenAI-compatible endpoint

Any endpoint that serves `POST <base URL>/chat/completions` with streaming and tool calls works: OpenAI itself, a gateway, or a local server such as Ollama or vLLM. Name the model:

```sh
PROTOBASE_ASSISTANT_BASE_URL=http://localhost:11434/v1
PROTOBASE_ASSISTANT_API_KEY=ollama      # sent as the bearer token; a local server may ignore it
PROTOBASE_ASSISTANT_MODEL=llama3.3
```

The model needs tool calling for the queries. A refused key, an exhausted account or a wrong model shows in the chat as a red card with the endpoint's own message, such as `The model endpoint https://openrouter.ai/api/v1 answered 401: No auth credentials found (check the API key)`.

## The built-in backend

It lives at `/api/assistant` on the app's own origin and answers with the user's token like the rest of the API. Its system prompt describes the resources, tables and fields the user can see in `/meta`. It has two tools:

- **`run_read_only_query`** runs one `SELECT` (or `VALUES`, or a `WITH` query) and shows its rows as a table in the chat. It runs in a `READ ONLY` transaction that is always rolled back, with a statement timeout of 5 seconds and at most 200 rows. The statement is sent with a parameter, so every Postgres driver uses the extended protocol, where Postgres refuses a text with more than one command: the statement cannot `COMMIT` its way out, and Postgres refuses every write inside (`SET TRANSACTION READ WRITE`, writable CTEs, `nextval`, `DO` blocks, functions that write). Settings it changes go with the rollback.
- **`propose_write_query`** never runs on its own. It shows the statement and a summary on a card with **Approve** and **Reject**. Only Approve runs it, as one statement in a read-write transaction; Reject, or no answer within 10 minutes, runs nothing. The model gets the returned rows, or that nothing ran. Statements are `INSERT`, `UPDATE` or `DELETE` with a `RETURNING` clause.

Both run as the app's database role, **outside Protobase's access rules and tenant scoping**: whoever has the `admin` or `ai` role can read, and with approval change, everything that role can. Give the app a database role without superuser rights, and those roles only to people who may see all of the data.

Conversations live in the server's memory, one per user, shared by their tabs: a restart forgets them, and a deployment of several instances gives each its own.

## The protocol

Every backend speaks the same protocol, so the app works with any of them. Requests carry the user's API token as `Authorization: Bearer <token>`. A backend on another origin verifies the token against the app's key set (`/api/auth/jwks`) and must allow the app's origin with CORS.

| Request | |
| --- | --- |
| `GET <url>/events` | a `text/event-stream`; each event's `data` is one JSON event, a `state` event first |
| `POST <url>/messages` | `{ "text": "..." }`: the user's message; `202`, the reply arrives as events |
| `POST <url>/actions` | `{ "partId": "...", "actionId": "..." }`: a click on a card's button; `202` |

Errors are `application/problem+json`; the app shows their `detail`. The app reconnects to the event stream when it ends or fails, after one second, doubling up to 30.

The state is a chat:

```ts
type AssistantState = {
  messages: Array<{ id: string; from: 'user' | 'assistant'; parts: AssistantPart[] }>
  replying: boolean          // the user can write but not send
  status?: string            // a line in the dock's header
  placeholder?: string       // the composer's placeholder; a new one focuses the composer
}
```

Events change it: `{ type: 'state', state }` replaces it, `{ type: 'message', message }` adds a message or replaces the one with its id, `{ type: 'part', messageId, part }` adds a part to a message or replaces the one with its id (starting an assistant message when the id is new), and `{ type: 'patch', replying?, status?, placeholder? }` changes the top-level fields, `null` clearing one. A card that changes, such as one whose buttons were answered, is the same part sent again.

Parts are what the app knows how to draw:

| Part | |
| --- | --- |
| `{ type: 'text', id, text }` | plain text |
| `{ type: 'table', id, columns, rows, caption?, truncated? }` | rows of values; `null` stays visible, objects show as JSON |
| `{ type: 'card', id, title, tone?, badge?, body?, code?, fields?, steps?, diffs?, note?, actions? }` | a card: `tone` is `neutral`, `info`, `success`, `warning` or `danger`; `fields` labelled values; `steps` labels that are `pending`, `running`, `done` or `failed`; `diffs` changed lines (`{ path?, source, start? }`, `+` and `-` lines); `actions` its buttons |

A button is `{ id, label, style?, disabled?, hint?, confirm? }`: `style` is `primary`, `secondary`, `ghost` or `danger`, `hint` a line under the buttons, and `confirm` a question the app asks before it sends the click. The backend gives every meaning: a proposal with a price is a card with a badge and an `Approve` button labelled however the backend likes.

The types are exported by `@protobase/schema` (`AssistantState`, `AssistantEvent`, `AssistantPart`, ...), with `applyAssistantEvent`, which folds an event into a state, and `readEventStream`. `@protobase/client` has the browser side, `createAssistantClient({ url, token })`.

## Writing a backend

`@protobase/server` exports the pieces the built-in backend is made of, so another backend can reuse them with its own prompt and tools:

| Export | |
| --- | --- |
| `assistantProtocolRoutes({ authenticate, allows, conversationOf, onMessage })` | the protocol's requests as a Hono app, with the event stream |
| `createConversations()`, `conversationKey(session)` | conversations in memory, one per user, with the events, the model's transcript and the buttons waiting for a click |
| `runTurn({ model, conversation, session, system, tools }, text)` | one turn: calls the model with the transcript and the tools, runs the tools it calls and calls it again, streaming its text into the chat |
| `defineTool({ name, description, parameters, run })` | a tool: `parameters` is a JSON Schema, `run(args, context)` returns what the model reads; `context.show(part)` adds a part to the chat and `context.approve(request)` asks the user |
| `requestApproval(conversation, messageId, { title, body?, code?, fields?, badge?, approveLabel?, rejectLabel?, timeoutMs? })` | a card with two buttons; resolves with `approved`, `rejected` or `expired` |
| `readOnlyQueryTool(db)`, `readWriteQueryTool(db)` | the two query tools |
| `runReadOnlyQuery(db, sql)`, `runReadWriteQuery(db, sql)` | the queries they run, with `{ timeoutMs, rowLimit }` |
| `streamChatCompletion(model, messages, onText, { tools })` | one streamed call to an OpenAI-compatible endpoint |

```ts
import { Hono } from 'hono'
import { assistantProtocolRoutes, betterAuthAuthenticator, conversationKey, createConversations, defineTool, readOnlyQueryTool, runTurn } from '@protobase/server'

const conversations = createConversations()
const model = { baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_KEY!, model: 'openrouter/auto' }
const tools = [
  readOnlyQueryTool(db),
  defineTool({
    name: 'open_ticket',
    description: 'Opens a support ticket after the user approves it.',
    parameters: { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'] },
    run: async ({ subject }, context) => {
      const answer = await context.approve({ title: 'Open a ticket?', body: String(subject), approveLabel: 'Open' })
      return answer === 'approved' ? await openTicket(String(subject)) : 'The user did not open it.'
    },
  }),
]

export const assistant = new Hono().route('/assistant', assistantProtocolRoutes({
  authenticate: betterAuthAuthenticator({ jwksUrl: 'https://app.example.com/api/auth/jwks', issuer: 'https://app.example.com' }),
  allows: (session) => session.user.roles.includes('admin'),
  conversationOf: (session) => conversations(conversationKey(session)),
  onMessage: (text, session, conversation) => runTurn({ model, conversation, session, system: 'You help with support tickets.', tools }, text),
}))
```

Point the app at it with `PROTOBASE_ASSISTANT_URL=https://assistant.example.com/assistant`.

## In the UI

The dock is `AssistantDock` from `@protobase/ui`, which draws a state; `useAssistant(client)` follows a backend into one. It is built from primitives that custom components and [shell slots](/reference/custom-components/#shell-slots) can use too:

| Component | |
| --- | --- |
| `SidePanel` | a full-height panel beside the page, with a title, an optional status, a close button and a footer |
| `ChatThread`, `ChatMessage`, `Composer` | a scrolling chat kept at its newest message, a message, and the text box under it |
| `ActionCard`, `FieldList` | a toned card with buttons (and confirmations), and labelled values |
| `StepList` | steps that are pending, running, done or failed |
| `DiffView` | changed lines of a file, numbered, with the counts of added and removed lines |
| `CompactTable` | a small table of raw values with a row count |

`useApiToken()` returns the signed-in user's API token (a JWT from `/api/auth/token`), renewed before it expires, for calling another service as them; it is `undefined` while it loads and when nobody is signed in.
