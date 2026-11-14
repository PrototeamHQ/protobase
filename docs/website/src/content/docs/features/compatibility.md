---
title: Compatibility and moving from other systems
description: Apps written for other systems that keep working on Protobase, and moving their data and code over.
---

## Supabase

- [Supabase import](/reference/cli/#import-supabase) (beta): Moves a Supabase project into Protobase, with schema, data, users, functions, storage and scheduled jobs, and a coding agent's skill finishes what its report leaves.
- [Create a project on a Supabase database](/getting-started/#on-a-supabase-database) (beta): your Supabase users sign in to the new project with their own passwords, and Supabase's own auth schema stays as Supabase set it up.
- [Supabase client API](/reference/supabase-rest/) (beta): supabase-js `from()` and `rpc()` calls keep working, under the tables' RLS policies.
- [Supabase Auth](/reference/auth/#supabase-js-and-supabasessr) (beta): `supabase.auth` and `@supabase/ssr` calls keep working.
- [Supabase Storage](/reference/supabase-storage/) (beta): supabase-js storage calls keep working, over the app's file storage.
- [Supabase Realtime](/reference/supabase-realtime/) (beta): Database changes, broadcast and presence through supabase-js channels, private ones authorized by the policies on `realtime.messages`, broadcasts sent from a server without joining a channel, and broadcasts from the database with `realtime.send()` and `realtime.broadcast_changes()`, across [several processes](/reference/supabase-realtime/#several-processes) serving one app.
- [Edge Functions](/guides/api-functions/#functions-moved-from-supabase): Functions moved from Supabase answer at their old addresses.

## Template paths

- [Paths and scopes](/reference/layouts/#paths-and-scopes) (beta): Layout paths follow Mustache's context-stack lookup and Handlebars' path grammar: `../`, `this`, `./`, `@root`, `@index`, `@first` and `@last`, though `@root` cannot be read yet. Protobase differs in three ways: a placeholder is escaped for the string it lands in, such as a filter's quoted value, rather than for HTML; `@params` names a [page parameter](/reference/layouts/#page-parameters), which a `SelectInput` sets; and a name no record around it has fails the build instead of drawing empty.

## react-admin

- [Related records](/reference/layouts/#related-records) (beta): Layouts take react-admin's `ReferenceManyField`, `ReferenceArrayField`, `ArrayField`, `RecordsIterator` and `ReferenceField` with their names, props and defaults: `sort` is the key descending, and a `ReferenceManyField`'s `source` is `id` and its `perPage` 25.
- [Text filters on related records](/reference/layouts/#related-records) (beta): `filter` and `sort` also take AIP-160 and AIP-132 text, since an object cannot say `OR`.
- [Page size of related records](/reference/layouts/#related-records) (beta): A list reads at most 500 records, the API's largest page, which is also a `ReferenceArrayField`'s `perPage` where react-admin's is 1000.
- [Items of an ArrayField](/reference/layouts/#related-records) (beta): A text item of an `ArrayField` is read as `this`. An `ArrayField` takes no `filter`, `sort` or `perPage` yet.
- [RecordsIterator without functions](/reference/layouts/#related-records) (beta): `RecordsIterator` takes no `render`, `data`, `total` or `isPending`, as a layout holds no functions and the list around it gives the rest.
- [SelectInput in the address](/reference/layouts/#page-parameters) (beta): `SelectInput` takes react-admin's `source`, `choices` as `{ id, name }`, `label` and `defaultValue`, and writes its choice into the page's address as `?<source>=<id>`, read as `@params.<source>`, instead of into a form.
- [Links of a ReferenceField](/reference/layouts/#related-records) (beta): A `ReferenceField` links to the record's page for both `edit` and `show`, as a record has one page.
