---
title: Tables users add
description: Tables an app's users add from the admin UI, by hand or from a file, and how a developer takes them over as code.
---

- [Tables defined in the database](/reference/user-tables/#tables-defined-in-the-database) (beta): An app can keep tables its users add in its own database, beside the resources in its code. Each one is served like any other resource, at its own address with its list, record page, search and API. Every server process serves a new table within a second of it being added.
- [Adding tables and fields](/reference/user-tables/#adding-tables-and-fields) (beta): Someone with the right capability creates a table with its fields, or adds a field to it, through the app's API. It is created in the database at once, with an index for every field but JSON so its list can be filtered by it, and sorted by it unless it is long text, and only admins can see it until access is widened.
- [Adding a table in the admin app](/reference/user-tables/#in-the-admin-app) (beta): People who may add tables find Tables in the admin app, make a table with its fields and add fields later, on a computer or a phone. The new table appears in the sidebar at once.
- [A table from a file](/reference/user-tables/#a-table-from-a-file) (beta): An Excel, CSV or JSON file becomes a new table: each column a field typed from what its cells hold, each row a record. Values are never guessed: `007`, `1,5` and `03/04/2026` stay text, and an empty cell stays empty.
- [Taking a table over as code](/reference/cli/#eject) (beta): `protobase eject` turns a table someone added in the admin app into ordinary config and a migration in the project, so a developer can customise it like any other resource. Its records stay where they are.
- [Tables per organization](/reference/user-tables/#organizations) (beta): In an app with organizations, a table someone adds belongs to their organization. Only its owners and admins, and superusers working in it, see the table and its records.
