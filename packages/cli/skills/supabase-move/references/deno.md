# Deno and Supabase's runtime, for Node and Bun

What the conversion leaves in `functions/`, by the note the report gives, and what replaces it. A function runs under Node and Bun with Web APIs (`fetch`, `Request`, `Response`, `crypto.subtle`, `URL`) and Node's built-in modules.

## Imports

| Note | Rewrite |
| --- | --- |
| `import of https://deno.land/std@.../<module>/...` | The same module from JSR, `@std/<module>`, in `package.json` as `"@std/<module>": "npm:@jsr/std__<module>@^1"` with `@jsr:registry=https://npm.jsr.io` in `.npmrc`; or Node's own, where it has one (`std/path` → `node:path`, `std/encoding/base64` → `Buffer.from(x).toString('base64')`, `std/crypto` → `crypto.subtle`). |
| `import of https://deno.land/x/<module>...` | The npm package of the same library, when its README names one; otherwise a maintained npm package that does the same, which the user agrees to. Take its version from `npm view <package> version`, never from memory. A database client (`deno.land/x/postgres`) becomes the function's `db` (Kysely on the app's database). |
| `import of https://<other host>/...` | The npm package the URL serves, by the same rule. |

## Deno

| Note | Rewrite |
| --- | --- |
| `Deno.readTextFile`, `Deno.readFile`, `Deno.writeTextFile`, `Deno.writeFile` | `readFile`, `writeFile` of `node:fs/promises`. A file beside the function: `new URL('./<file>', import.meta.url)`. Bundled apps have no writable folder: data a function wrote to disk goes to a table or the app's Storage instead. |
| `Deno.env.toObject` | `process.env`. |
| `Deno.cwd`, `Deno.args`, `Deno.exit` | `process.cwd()`; no arguments; throw an error instead of exiting. |
| `Deno.openKv` | A table, in a migration, in a schema named for what it keeps (`create table <schema>.<name> (key text[] primary key, value jsonb not null, expires_at timestamptz)`), read and written with the function's `db`. `expireIn` becomes `expires_at`, and readers skip expired rows. Deno KV's data does not come over: start empty, unless the user exports it. |
| `Deno.upgradeWebSocket` | A function answers HTTP only. Move the messages to Realtime broadcast on a channel, which supabase-js reaches at `/api/sb/realtime/v1` (see [Supabase Realtime](../../protobase/references/reference/supabase-realtime.md)), and change the client to it; when that does not fit, stop on it and tell the user. |
| `Deno.serve(...)` or `serve(...)`, `which Protobase does not run` | Make the file's default export `{ fetch: handler }` itself, once per function, in its `index.ts`. |
| `no Deno.serve or default export to serve` | Find the handler and default-export `{ fetch: handler }`. |
| `<dir> has no index.ts, so it was not imported` | Move its entry point to `index.ts` in `supabase/functions/<name>`, and convert it as the import did: rerun it in a scratch checkout, or apply this table by hand. |
| `asks for <package> <range>, another file for <range>` | Make both files work with one version, the range `package.json` has. |

## Supabase's runtime

| Note | Rewrite |
| --- | --- |
| `Supabase.ai.Session('gte-small')` | The same model under Node with `@huggingface/transformers`: `const embed = await pipeline('feature-extraction', 'Supabase/gte-small')` once per process, then `Array.from((await embed(text, { pooling: 'mean', normalize: true })).data)` where the code called `session.run(text, { mean_pool: true, normalize: true })`. It gives the same 384 numbers, so stored embeddings keep matching. |
| `Supabase.ai.Session('<an LLM>')` | A call to an OpenAI-compatible chat completions endpoint with `fetch`, its URL, key and model from `requireEnv`; the user picks the provider and fills them in. |
| `EdgeRuntime.<anything but waitUntil>` | Drop it, or its Node equivalent (`process.version` for the version). |
