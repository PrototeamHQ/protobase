---
title: Assistant
description: The chat beside the admin, who sees it, and its built-in backend on OpenRouter or another OpenAI-compatible endpoint.
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
| `PROTOBASE_ASSISTANT_CHATS` | `chats` | the directory the built-in backend keeps conversations in; default `.protobase/chats` |

### With OpenRouter

Create a key at [openrouter.ai](https://openrouter.ai/keys) and set it, with a model of your choice:

```sh
PROTOBASE_ASSISTANT_API_KEY=sk-or-v1-...
PROTOBASE_ASSISTANT_MODEL=anthropic/claude-sonnet-5.5   # optional; OpenRouter picks one without it
```

On OpenRouter the built-in backend asks for low reasoning effort and marks the system prompt and the earlier chat for prompt caching, so models that cache, such as Anthropic's, bill the repeated part of each request as a cheaper cache read.

### With another OpenAI-compatible endpoint

Any endpoint that serves `POST <base URL>/chat/completions` with streaming and tool calls works: OpenAI itself, a gateway, or a local server such as Ollama or vLLM. Name the model:

```sh
PROTOBASE_ASSISTANT_BASE_URL=http://localhost:11434/v1
PROTOBASE_ASSISTANT_API_KEY=ollama      # sent as the bearer token; a local server may ignore it
PROTOBASE_ASSISTANT_MODEL=llama3.3
```

The model needs tool calling for the queries. A refused key, an exhausted account or a wrong model shows in the chat as a red card with the endpoint's own message, such as `The model endpoint https://openrouter.ai/api/v1 answered 401: No auth credentials found (check the API key)`.

## The built-in backend

It lives at `/api/assistant` on the app's own origin and answers with the user's token like the rest of the API. Its system prompt describes the resources, tables and fields the user can see in `/meta`. It has two tools of its own, and [the app's](#the-apps-own-tools):

- **`run_read_only_query`** runs one `SELECT` (or `VALUES`, or a `WITH` query) and shows its rows as a table in the chat. It runs in a `READ ONLY` transaction that is always rolled back, with a statement timeout of 5 seconds and at most 200 rows. The statement is sent with a parameter, so every Postgres driver uses the extended protocol, where Postgres refuses a text with more than one command: the statement cannot `COMMIT` its way out, and Postgres refuses every write inside (`SET TRANSACTION READ WRITE`, writable CTEs, `nextval`, `DO` blocks, functions that write). Settings it changes go with the rollback.
- **`propose_write_query`** never runs on its own. It shows the statement and a summary on a card with **Approve** and **Reject**. Only Approve runs it, as one statement in a read-write transaction; Reject, or no answer within 10 minutes, runs nothing. The model gets the returned rows, or that nothing ran. Statements are `INSERT`, `UPDATE` or `DELETE` with a `RETURNING` clause.

Both run as the app's database role, **outside Protobase's access rules and tenant scoping**: whoever has the `admin` or `ai` role can read, and with approval change, everything that role can. Give the app a database role without superuser rights, and those roles only to people who may see all of the data.

### The app's own tools

`options.assistant.tools` adds tools of the app's own, which the built-in backend offers after its two. A tool is `defineTool({ name, description, parameters, run })` from `@protobase/server`: `parameters` is the JSON Schema of its arguments, and `run(args, context)` returns the text the model reads. A name must be 1 to 64 letters, digits, `_` or `-`, and a name taken twice stops the server at startup. A backend elsewhere has its own tools, so the option does nothing there.

`context` holds the user's `session`, `show(part)` to add a part to the answer, `approve(request)` for an approval card, and `records`: `get(resource, key)`, `create(resource, data)` and `update(resource, key, data, { etag? })` (without an ETag it updates any version) on the app's resources **as the user**, through their access rules, tenant scope, validation and write hooks, as in the REST API. Each answers `{ record, etag }`; a refusal or a missing record rejects with an `HttpProblem`, whose `detail` a tool can return to the model as text.

A tool with a [widget](#widget-parts) creates or finds what it is about, shows a widget with its id, and returns the id and the state at that moment:

```ts
// config/assistant/propose-task.ts
import { defineTool, widget } from '@protobase/server'

export const proposeTask = defineTool({
  name: 'propose_task',
  description: 'Proposes a task; someone approves or declines it on its card, now or later. Read it again before relying on its status.',
  parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  run: async (args, { records, show }) => {
    const { record } = await records.create('tasks', { title: args.title, status: 'proposed' })
    show(widget('TaskProposal', { taskId: record.id }, { fallback: { title: `Task proposal: ${String(record.title)}` } }))
    return JSON.stringify({ taskId: record.id, status: 'proposed' })
  },
})

// protobase.config.ts: export default { ..., options: { assistant: { tools: [proposeTask] } } }
```

```tsx
// protobase.ui.tsx
const TaskProposal = ({ taskId }: { taskId: number }) => {
  const task = useRecord('tasks', taskId)
  const update = useUpdateRecord('tasks', taskId)
  if (!task.data) return <ActionCard title="Task proposal" note={task.error ? 'Could not load the task' : 'Loading'} />
  const { record, etag } = task.data
  return (
    <ActionCard title={String(record.title)} badge={String(record.status)}
      note={record.status === 'proposed' ? undefined : `${String(record.status)} by ${String(record.decidedBy)}`}
      actions={record.status === 'proposed' ? [{ id: 'approved', label: 'Approve', style: 'primary' }, { id: 'declined', label: 'Decline' }] : []}
      onAction={(status) => update.mutate({ patch: { status }, etag })} />
  )
}

export default defineUi({ components: { TaskProposal } })
```

The tool and its component live apart, joined by the name, since the server config cannot import `@protobase/ui` and the browser must not get server code; put shared prop types in a file both import with `import type`. Whoever may update the task decides on it, now or next month, from the chat or the task's own page, and a write hook can stamp who did from `event.user`; when two decide at once, the ETag makes the second write fail and the widget shows the first decision. The chat is not told: the model learns of the change by reading the record again, which the description asks it to do.

Each message carries the page the user is on, such as `/orders/42`, which the model reads with it.

There is one conversation per user, shared by their tabs. The server keeps it as a file, `<chats>/<user>/chat.jsonl` (see `PROTOBASE_ASSISTANT_CHATS`), with the chat and everything the model read, so a restart keeps it and the app only ever sends the new message. The directory is made on the first message and must be writable: in a container, point it at a volume. With several instances, send each user's requests to the same one.

## Another backend

A backend elsewhere replaces the built-in one through `PROTOBASE_ASSISTANT_URL`. It receives the user's API token as `Authorization: Bearer <token>`, verifies it against the app's key set (`/api/auth/jwks`), and allows the app's origin with CORS. It can be built from the building blocks `@protobase/server` exports (the protocol's routes, the turn loop with tool calling, tools, approvals, the query tools and a conversation store interface to keep chats elsewhere, such as in a database) with its own prompt and tools; the built-in backend's source, `packages/server/src/assistant/built-in-assistant.ts`, is the reference.

## Widget parts

Besides text, tables and cards, a backend can show a **widget**: a part that one of the app's own React components draws. The chat keeps only the component's name and a small JSON of props, such as `{ "taskId": 12 }`, and the component fetches what it shows when it is drawn, so a chat from last month shows the record as it is today, including a decision someone else made since.

```ts
import { widget } from '@protobase/server'

show(widget('TaskProposal', { taskId: record.id }, { fallback: { title: `Task proposal: ${record.title}` } }))
```

`widget(name, props, { id?, fallback? })` builds the part `{ type: 'widget', id, name, props, fallback? }`. The name must be PascalCase, and the props a JSON object of at most 2 KB, or it throws: pass ids and settings, not the state the widget shows. Without an `id` the part gets a new one; showing a part with the same id again replaces it. `fallback` is drawn as a plain card where the app has no component by that name. The part never reaches the model, which reads only the tool's result.

### How the dock draws them

The dock draws a widget part with the component of that name in the app's `components`, the same registry [composed pages](/reference/custom-components/#components) use, giving it the part's props. The component reads what it shows when it is drawn, as the signed-in user: the dock is mounted only while it is open, so each opening, and each page load, reads it again. Its buttons call the app's API or the backend directly; they need no turn of the chat, so they work after a restart, from any tab and for any user who may make the call.

- **No component by that name**, such as in an app built before the component was added: the dock draws the fallback as a plain card noting "This version of the app cannot show it live", or, without a fallback, a muted line naming the component.
- **A component that throws** is caught on its own: the dock draws the fallback noting "It could not be drawn", without the error, and the rest of the chat stays.

Docks from before widget parts skip them; rebuild the app on a release that has them.

### Reading the backend from a widget

A widget about the app's own data uses the usual hooks (`useRecord`, `useList`, `useUpdateRecord`, `useClient`). A widget about the backend's own data, such as a hosted backend's tasks, uses `useBackendData` from `@protobase/ui`:

```tsx
const Task = ({ taskId }: { taskId: string }) => {
  const path = `/api/assistant/tasks/${encodeURIComponent(taskId)}`
  const task = useBackendData<{ title: string; status: string }>(path, { refreshMs: (data) => (data?.status === 'running' ? 5000 : false) })
  if (!task.data) return <ActionCard title="Task" note={task.error ? 'Could not load the task' : 'Loading'} />
  return <ActionCard title={task.data.title} badge={task.data.status} note={task.error?.message} actions={[{ id: 'decline', label: 'Decline' }]} onAction={(action) => void task.post(`${path}/actions`, { action })} />
}
```

It returns `{ data, error, reload, post(path, body) }`. It reads `path` when the widget mounts, and again every `refreshMs` while that is a number; `post` sends JSON and its answer replaces `data`. A failed read or post sets `error`, an `ApiError` carrying the backend's problem detail, and keeps the last `data`. The path resolves against the backend's URL from `/meta` and goes through the dock's client (`AssistantClient.fetch`), with the same bearer token as the chat; a path on any other origin is refused before a request is made, so props a model wrote cannot send the user's token elsewhere. It works only in a widget the dock draws.

Breaking change: `AssistantPart` now includes `AssistantWidgetPart`, so code that switches over part types must handle `widget`, for instance by drawing its `fallback`.

## In the UI

The dock is `AssistantDock` from `@protobase/ui`, built from primitives that custom components and [shell slots](/reference/custom-components/#shell-slots) can use too: `SidePanel`, `ChatThread`, `ChatMessage`, `Composer`, `ActionCard`, `FieldList`, `StepList`, `DiffView` and `CompactTable`. `useApiToken()` returns the signed-in user's API token, renewed before it expires, for calling another service as them.
