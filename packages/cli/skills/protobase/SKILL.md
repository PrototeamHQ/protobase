---
name: protobase
description: Build, check and ship a Protobase admin app on Postgres (data.ts, ui.ts, the protobase CLI), with the guides and reference for this Protobase version. Use it when working in a Protobase project.
---

# Protobase

Protobase is a config-driven admin on an existing Postgres database. `config/index.ts` exports the resources, `config/<resource>/data.ts` describes a table and `ui.ts` its views, `functions/` holds the app's API functions, and `protobase.config.ts` in the project root replaces the conventions when it exists. The app's own React code (components, field types, actions) is a plugin in `protobase.ui.tsx`.

Run the CLI as the project does: `npx protobase <command>`, or `bun run protobase <command>`. These pages describe the Protobase version installed in the project.

## Everyday workflow

1. Run `protobase dev`: one process and one port, the admin app and the API; changes to config, layouts and functions show without a restart.
2. Change the config (`data.ts`, `ui.ts`, layouts) or the app's code.
3. Database changes go through the project's migrations, never through startup: `protobase migration` writes the migrations a config feature needs, the project applies them with its own migrate script. See [references/reference/cli.md](references/reference/cli.md#migration).

## Before calling a change done

1. Typecheck and test the project with its own scripts (`tsc --noEmit` and the tests).
2. Run `protobase doctor --env DATABASE_URL` after the project's migrations. It checks every resource against the database (tables, columns, types, keys) and every read the API would refuse for lack of an index. Exit code 1 means errors. Fix a refused read with the `create index` it prints, as a migration; never loosen the scan guard. See [references/reference/cli.md](references/reference/cli.md#doctor).
3. Run `protobase build`: it needs no database and must succeed.

## Ship

`protobase build` writes the bundle (`dist/`); the host runs the serve runtime around it, after the project's migrations and with no other writes while they run. Check a bundle locally with `protobase serve dist`. Details: [references/guides/deploy.md](references/guides/deploy.md).

An app hosted on protobase-cloud deploys from a push to its GitHub branch instead: the `protobase-cloud` skill, which `protobase skill install` writes next to this one, covers it.

A project moved from Supabase with `protobase import supabase` has what the import could not convert in `supabase-import/report.md`: the `supabase-move` skill, written next to this one too, finishes it.

## Rules of thumb

- Records live at the framework's standard addresses and API; give a resource another look through its views, layouts or a plugin, not a page with routes of its own.
- A `.filterable()` or `.sortable()` field, a search and an owner column need an index; doctor fails without one.
- Plugins keep working as Protobase moves on; the bundle is built again for a new minor version below 1.0.
- Check the `@protobase` package versions before trusting an example: below 1.0 a minor version may change the config.

## When you need more

Guides:

- When setting up or running a project for the first time → read [Getting started](references/getting-started.md)
- When shipping a project as a bundle and running it with the serve runtime → read [Deploy](references/guides/deploy.md)
- When turning a table into an admin with fields, views and filters → read [From a table to an admin](references/guides/table-to-admin.md)
- When building a page from layouts and blocks → read [Your first composed page](references/guides/first-composed-page.md)
- When giving customers a page for their plan, cards and invoices → read [A billing page](references/guides/billing-page.md)
- When adding endpoints of your own beside the REST API → read [Your own API functions](references/guides/api-functions.md)
- When writing React code of your own → read [Your first plugin](references/guides/first-plugin.md)
- When changing colors, corners or font → read [Theming an app](references/guides/theme-an-app.md)
- When showing or editing a field your own way → read [Adding a field type](references/guides/field-type.md)
- When drawing the cards of a list yourself → read [A custom record card](references/guides/record-card.md)
- When a project built its UI into the admin app and must move to the plugin build → read [Moving onto the plugin build](references/guides/plugin-build.md)
- When showing another Protobase app's records → read [Showing another app's records](references/guides/remote-resources.md)
- When letting users save a list as Excel or CSV → read [Exporting a list](references/guides/export-a-list.md)
- When importing records from a spreadsheet → read [Importing records from a spreadsheet](references/guides/import-records.md)
- When replacing a resource's create form with a page of your own → read [A create page of your own](references/guides/create-page.md)
- When running the app on iOS or Android → read [A mobile app](references/guides/mobile-app.md)

Reference:

- When defining resources, fields, keys, relations, rollups, formulas and validation → read [Data config](references/reference/data-config.md)
- When defining views, columns, filters, charts, related records and actions → read [UI config](references/reference/ui-config.md)
- When asking how the packages fit together → read [Architecture](references/reference/architecture.md)
- When calling or changing the REST API, its filters, writes and errors → read [REST API](references/reference/api.md)
- When an app calls it with supabase-js, `from()` and `rpc()` under RLS → read [Supabase client API](references/reference/supabase-rest.md)
- When an app calls `storage` with supabase-js, under the storage policies → read [Supabase Storage API](references/reference/supabase-storage.md)
- When working with file fields and uploads → read [Files](references/reference/files.md)
- When reacting to changes of records → read [Events](references/reference/events.md)
- When delivering events to URLs → read [Webhooks](references/reference/webhooks.md)
- When keeping or showing the changes of records → read [Record history](references/reference/history.md)
- When adding comments to records → read [Record comments](references/reference/comments.md)
- When open pages should refresh as records change → read [Live updates](references/reference/live.md)
- When an app uses supabase-js Realtime (`postgres_changes` under RLS, broadcast, presence) → read [Supabase Realtime](references/reference/supabase-realtime.md)
- When filling fields with a model → read [AI fields and actions](references/reference/ai.md)
- When letting people without an account create records → read [Public forms](references/reference/forms.md)
- When running background jobs → read [Jobs](references/reference/jobs.md)
- When sending email → read [Email](references/reference/email.md)
- When setting roles, capabilities and row filters → read [Access](references/reference/access.md)
- When configuring sign-in, tokens and the auth schema → read [Login with Better Auth](references/reference/auth.md)
- When using the typed client and hooks → read [Client and live UI](references/reference/client.md)
- When writing composed pages in JSX → read [Layouts](references/reference/layouts.md)
- When looking for a built-in layout block and its props → read [Blocks](references/reference/blocks.md)
- When using components and action handlers of your own in layouts → read [Custom components](references/reference/custom-components.md)
- When building or loading plugins → read [Plugins](references/reference/plugins.md)
- When using resources another Protobase API serves → read [Remote resources](references/reference/remote-resources.md)
- When setting the app's tokens, colors and fonts → read [Theme](references/reference/theme.md)
- When setting the app's name, icon, home-screen icons or install colours → read [App identity](references/reference/app-identity.md)
- When showing the app's screens in Dutch → read [Languages](references/reference/languages.md)
- When installing the app on a phone or computer, or asking what it does offline → read [Installable app](references/reference/installable-app.md)
- When grouping sidebar entries or listing recent records → read [Sidebar](references/reference/sidebar.md)
- When changing the user menu → read [User menu](references/reference/user-menu.md)
- When adding tabs along the bottom of a phone → read [Bottom bar](references/reference/bottom-bar.md)
- When configuring the chat beside the admin → read [Assistant](references/reference/assistant.md)
- When looking for a command or its options → read [CLI](references/reference/cli.md)
- When asking how Protobase is versioned and which bundles a runtime runs → read [Versioning](references/reference/versioning.md)
- When looking for an export of `@protobase/schema` → read the [API reference](https://docs.protobase.net/api/schema/)

## Keep this skill current

After upgrading the `@protobase` packages, run `protobase skill install` again so the skill matches the installed version.
