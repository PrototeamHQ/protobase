---
title: Access
description: Decide who may read and change which records and fields.
---

- [Roles and capabilities](/reference/access/#capabilities): Roles defined in code grant capabilities per resource and action. A project with roles denies anything not granted.
- [Field and row limits](/reference/access/#capabilities): A role can be limited to listed fields and to rows that match a filter. A field added later stays hidden from that role until it is listed.
- [Field rules](/reference/access/#field-rules-or-field-lists): Single fields, such as a cost price, can be hidden from every role that lacks a given capability.
- [Owned records](/reference/data-config/#access): Users can be limited to the records they own, through an owner field.
- [Rules on the stored record](/reference/data-config/#access): A rule can read the record as it is stored, such as one that refuses changes to a locked invoice.
- [Write-only fields](/reference/access/#write-only-fields): A role can set a field it can never read back, such as a secret only a worker reads.
- [Access through a parent record](/reference/access/#records-that-belong-to-another): Writing a child record can require access to the record it belongs to.
- [Anonymous access](/reference/access/#anonymous-access): Visitors without an account can read listed fields of chosen records, such as a public product catalog.
- [Public browsing](/reference/access/#browsing-the-admin-app): With anonymous access on, visitors browse what they may read in the admin app without signing in, read-only, with a Sign in button.
- [Checked on every request](/reference/api/#access): The server applies the caller's operations, fields and rows to every request, on lists, record pages, composed pages and the API alike.
