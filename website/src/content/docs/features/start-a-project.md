---
title: Start a project
description: Start a new app, or an admin over an existing Postgres database, and keep the config in step with it.
---

- [Project starter](/getting-started/#start-an-app): `npm create protobase` (also `bun create` and `pnpm create`) starts a new app from the scratch, ERP or real estate preset, with its own Postgres in Docker for development, and prints the next steps. Each preset has an `AGENTS.md` with rules for coding agents.
- [Example apps](/getting-started/#run-the-erp-example): Seeded example apps on Postgres: an ERP, real estate property management and a public property portal.
- [One config](/reference/config/): The whole app is one object of data in `protobase.config.ts`, typed with `defineConfig`, with a sensible default for every key.
- [Code found by path](/reference/config/#where-the-code-is): The config names jobs, hooks and providers, and Protobase finds their code by its path, such as `jobs/<name>.ts`.
- [JSON config](/reference/config/#the-same-config-as-json): The same config works as `protobase.config.json`, with values from the environment written as `$env`.
- [Scaffold from a database](/reference/cli/#scaffold): Reads your Postgres tables and writes the data config for them, with field types, keys, relations, enums, soft delete, tenants and search filled in, and with `--ui` a first view of each.
- [Safe re-scaffolding](/reference/cli/#re-running): Running scaffold again adds only the columns that are not declared yet and leaves your own config code as it is.
- [Schema drift report](/reference/cli/#drift-report): After each scaffold, lists declared fields whose column is gone, whose type changed or whose enum values differ, with a suggested fix.
- [Doctor](/reference/cli/#doctor): Checks every resource and view against the database, including reads that lack an index, and prints the fix for each problem.
- [Admin without a view](/guides/table-to-admin/#1-the-table-as-it-is): A table with an empty view already gives a working admin with every column, sorting, paging, a record page and a New button.
- [Agent skills](/reference/cli/#skill): `protobase skill install` writes agent skills that match the installed version into the project, for the coding agents that work on it.
- [Docs as Markdown](/getting-started/#docs-as-markdown): Every docs page is also Markdown at its address plus `.md`, for coding agents and chat assistants.
