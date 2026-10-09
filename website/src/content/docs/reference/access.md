---
title: Access
description: Roles, capabilities, field rules and row filters, and what they default to.
---

Roles are defined in code (`defineRoles`) and assigned through the auth user's `roles`. Rules decide per operation (`list`, `read`, `create`, `update`, `delete`), per field (role-based, never per record) and per row (filters, like RLS).

## Defaults

- A project that passes `roles` to `resolveAccess` is **default deny**: an operation without a rule needs the capability `<resource>.<action>` (`list` uses `read`), so admin's `*` still passes. A field without a rule follows its resource.
- A project without roles (the single-admin case) is **default allow**.
- `defaultAccess: 'allow'` together with `roles` is an explicit opt-in. Print `accessWarnings(options)` at startup.

## Restricted model and row filters

`resolveAccess` returns everything a request may do. Use `restrictModel(model, access)` for everything user-facing (checking filters and sorts, queries, OpenAPI, `/meta`): hidden fields are gone, so they cannot be referenced, searched, sorted or leaked. Key columns always stay, because records are addressed by them.

Row filters (`access.rowFilter`) are a separate thing. They come from the access rules (`.own`, `.team`, returned filters), are checked against the **full** model because they may use hidden or non-filterable columns, and are ANDed into queries by the server.
