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

## Another backend

A backend elsewhere replaces the built-in one through `PROTOBASE_ASSISTANT_URL`. It receives the user's API token as `Authorization: Bearer <token>`, verifies it against the app's key set (`/api/auth/jwks`), and allows the app's origin with CORS. It can be built from the building blocks `@protobase/server` exports (the protocol's routes, the turn loop with tool calling, tools, approvals and the query tools) with its own prompt and tools; the built-in backend's source, `packages/server/src/assistant/built-in-assistant.ts`, is the reference.

## In the UI

The dock is `AssistantDock` from `@protobase/ui`, built from primitives that custom components and [shell slots](/reference/custom-components/#shell-slots) can use too: `SidePanel`, `ChatThread`, `ChatMessage`, `Composer`, `ActionCard`, `FieldList`, `StepList`, `DiffView` and `CompactTable`. `useApiToken()` returns the signed-in user's API token, renewed before it expires, for calling another service as them.
