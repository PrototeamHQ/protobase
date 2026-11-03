---
title: Tables users add
description: Tables an app's users add from the admin UI, by hand or from a file, and how a developer takes them over as code.
---

- [Tables defined in the database](/reference/user-tables/#tables-defined-in-the-database) (beta): An app can keep tables its users add in its own database, beside the resources in its code. Each one is served like any other resource, at its own address with its list, record page, search and API. Every server process serves a new table within a second of it being added.
- [Adding tables and fields](/reference/user-tables/#adding-tables-and-fields) (beta): Someone with the right capability creates a table with its fields, or adds a field to it, through the app's API. It is created in the database at once, with an index for every field but JSON so its list can be filtered by it, and sorted by it unless it is long text, and only admins can see it until access is widened.
