---
title: Start a project
description: Start a new app, or an admin over an existing Postgres database, and keep the config in step with it.
---

- [Project starter](/getting-started/#start-an-app): `npm create protobase` starts a new app from the scratch, ERP or real estate preset and prints the next steps.
- [Example apps](/getting-started/#run-the-erp-example): Seeded example apps on Postgres: an ERP, real estate property management and a public property portal.
- [Scaffold from a database](/reference/cli/#scaffold): Reads your Postgres tables and writes the data config for them, with field types, keys, relations, enums, soft delete, tenants and search filled in.
- [Safe re-scaffolding](/reference/cli/#re-running): Running scaffold again adds only the columns that are not declared yet and leaves your own config code as it is.
- [Schema drift report](/reference/cli/#drift-report): After each scaffold, lists declared fields whose column is gone, whose type changed or whose enum values differ, with a suggested fix.
- [Doctor](/reference/cli/#doctor): Checks every resource and view against the database, including reads that lack an index, and prints the fix for each problem.
- [Admin without a view](/guides/table-to-admin/#1-the-table-as-it-is): A table with an empty view already gives a working admin with every column, sorting, paging, a record page and a New button.
- [Agent skills](/reference/cli/#skill): `protobase skill install` writes agent skills that match the installed version into the project, for the coding agents that work on it.
