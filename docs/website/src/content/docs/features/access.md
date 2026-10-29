---
title: Access
description: Decide who may read and change which records and fields.
---

- [Roles and capabilities](/reference/access/#capabilities): Roles defined in code grant capabilities per resource and action. A project with roles denies anything not granted.
- [Field and row limits](/reference/access/#capabilities): A role can be limited to listed fields and to rows that match a filter. A field added later stays hidden from that role until it is listed, and the server does not start with a limit on a field or resource that does not exist.
- [Capability checks](/reference/access/#wildcards-in-has-can-and-holds): Your code asks whether a user holds one capability, or all of a wildcard such as `vms.*`, and a check that could pass by accident is refused.
- [Named grants for secrets](/reference/access/#resources-that-need-named-grants): A resource that holds secrets, such as webhook subscriptions, can be left out of wildcards like `*.read`, so only admins and roles that name it reach it.
- [Field rules](/reference/access/#field-rules-or-field-lists): Single fields, such as a cost price, can be hidden from every role that lacks a given capability.
- [Owned records](/reference/data-config/#access): Users can be limited to the records they own, or that their team owns, through an owner field. The server does not start when that field cannot hold the users' ids.
- [Rules on the stored record](/reference/data-config/#access): A rule can read the record as it is stored, such as one that refuses changes to a locked invoice.
- [Write-only fields](/reference/access/#write-only-fields): A role can set a field it can never read back, such as a secret only a worker reads. The admin app edits it only where the layout names it, with no stored value to reveal.
- [Lists across organizations](/reference/access/#lists-across-organizations) (beta): One list shows the records of every organization someone is a member of, each read with their role there, with the organization as a filter. Opening a record of another organization switches to it.
- [Access through a parent record](/reference/access/#records-that-belong-to-another): Writing a child record can require access to the record it belongs to, and a child can be read only by those who read its parent, such as the messages of a private channel.
- [Anonymous access](/reference/access/#anonymous-access): Visitors without an account can read listed fields of chosen records, such as a public product catalog, and send the public forms you open to them.
- [Public browsing](/reference/access/#browsing-the-admin-app): With anonymous access on, visitors browse what they may read in the admin app without signing in, read-only, with a Sign in button.
- [Checked on every request](/reference/api/#access): The server applies the caller's operations, fields and rows to every request, on lists, record pages, composed pages and the API alike. Each record says what the caller may change in it, so the admin app offers no edit the server would refuse.
