---
title: Supabase Storage API
description: The Storage-compatible /storage/v1 that supabase-js's storage calls, over the app's file provider, under the restored storage policies.
---

An app with API keys also serves `/storage/v1`, the API that supabase-js's `storage` calls. An app moved from Supabase keeps its uploads, downloads, public URLs and signed URLs: point the client at the app and give it the publishable key.

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://my-app.example.com', 'sb_publishable_...')
const { data, error } = await supabase.storage.from('avatars').upload(`${userId}/avatar.png`, file)
```

## Where things are kept

The buckets and objects are the rows of `storage.buckets` and `storage.objects`, the schema that `protobase import supabase` restores with its policies. The bytes go to one of the app's [file providers](/reference/files/): `files.storage.provider` in `protobase.config.ts`, `private` by default, so a local folder or an S3-compatible bucket, with that provider's `max_bytes` and `max_files` quota. An object's bytes are kept at `storage/<SHA-256 of bucket and name>/<version>` in the provider, where [`protobase import supabase --storage-url`](/reference/cli/#import-supabase) copies a Supabase project's. `files.storage.maxFileSize` caps every upload, `50 MB` by default, and a bucket's `file_size_limit` can only lower it. `files: { storage: false }` serves no `/storage/v1`.

## Keys and roles

The keys are `options.apiKeys` of `createAdmin`, `{ publishable_key, secret_key }`, or else `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`. Without either, or with `apiKeys: false`, the app serves no `/storage/v1`. A request sends a key in the `apikey` header and runs as:

| The request sends | It runs as |
| --- | --- |
| the publishable key | `anon` |
| either key and a signed-in user's token | `authenticated` |
| the secret key | the app's own role, which owns the tables |

The role is set with `SET LOCAL ROLE` and the token's claims in `request.jwt.claims` and `request.jwt.claim.sub`, so Supabase's `auth.uid()` works in the policies. The database needs the `anon` and `authenticated` roles, and the app's role must be allowed to `SET ROLE` to them. Every read and write of `storage.objects` and `storage.buckets` runs as that role, with the token's claims set, so the restored policies decide, as on Supabase:

- an upload needs an `insert` policy, and one with `upsert` also `select` and `update`;
- a download, a signed URL, `info`, `list`, `copy`'s source and `move` need `select`, and `move` also `update`;
- `remove` and `empty` delete only what a `delete` policy allows;
- the bucket calls need policies on `storage.buckets`, which usually only the secret key gets past.

An upload is checked against the policies before its bytes are stored, then its row is written as the caller in one transaction. A refused upload stores nothing, and the bytes of a write that fails are deleted.

Public buckets are served at `/storage/v1/object/public/<bucket>/<name>` without a key. A signed URL serves one object to anyone until it expires; a signed upload URL takes one upload for two hours, written for the user who signed it.

## What it serves

- `object/<bucket>/<name>`: upload (POST, with `x-upsert`), replace (PUT), download (GET, also `object/authenticated/...`), `exists` (HEAD) and delete.
- `object/public/...`, `object/sign/...` (one or many) and `object/upload/sign/...`.
- `object/list/<bucket>`, `object/move`, `object/copy` and `object/info/...`.
- `bucket`: list, get, create, update, empty and delete.

A download is sent with the type it was uploaded with, `nosniff` and a sandboxing Content-Security-Policy, so an uploaded page cannot run on the app's origin, and `?download` makes it an attachment.

Not yet: image transforms, resumable (TUS) uploads, the S3 protocol, and object versioning.

## Errors

Errors come back as Supabase Storage sends them: status `400` with `{ statusCode, error, message }`, where `statusCode` says what happened: `404` for an object or bucket that is not there or not visible, `403` for a refusal by policy, `409` for an object or bucket that exists, `413` for an object over the size limit, `415` for a type the bucket does not allow. A failure is `500`.
