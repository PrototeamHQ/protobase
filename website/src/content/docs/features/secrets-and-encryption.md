---
title: Encryption and secrets
description: Four levels of protection for a sensitive value, from masked and audited to encrypted, and who can still read the value at each.
---

<!--
DRAFT, local only, not committed and not in the protobase repo. Target: protobase website/src/content/docs/features/secrets-and-encryption.md
(plus a sidebar entry in website/sidebar.mjs and a line in features.md, as CONTRIBUTING "Features and docs" requires).

Provenance, please read:
- The product and marketing consultants (max effort) set the message, the order, and the words to use and avoid. See report.md, "Product and marketing advice".
- The copywriter consultant (max effort) wrote only level (a). It refused to state any Protobase fact that protobase-marketing's facts.md
  (still v0.17.0) does not record. That rules out encrypted fields, write-only fields, the encryption commands, the audit queue and the
  Cloud key, and it would not mark (c)/(d) coming soon while facts.md 15.4.1 ("may unbuilt features be mentioned?") is open.
  Its (a)-only page is kept verbatim at the bottom of this file.
- Levels (b)-(d) below are my wording. They follow the consultants' brief and the "(a)" copywriter style, and every claim is checked against
  the protobase docs (0.43/0.44, 2026-10-24). Run them through the copywriter again once facts.md is updated.
- Open before publishing: (1) update facts.md; (2) the captain answers 15.4.1. CONTRIBUTING allows "coming soon" only while a task builds it,
  and (c) is parked (pb-secret-key-holder) while (d) has no task; (3) the Cloud key line needs the brand's [Early access] label and
  data-loss disclaimer once, in brand.md's exact wording, which I don't have.
-->

You choose a level per field in your resource's `data.ts`, and the server enforces it on every request. Each level below says who can still read the value. Use a sensitive field for values staff need now and then, such as bank account numbers. Use an encrypted, write-only field for third-party secrets such as API keys and tokens, which a worker or integration reads and the person who sets them never sees again.

## Masked and audited

- [Sensitive fields](/reference/data-config/#sensitive-fields): `.sensitive()` keeps a field's value out of every list, response, search, history entry, event and webhook payload. The record page shows it masked, with an eye button.
- [Reveal with an audit event](/reference/api/#sensitive-fields-and-audit): A permitted user reveals one record's value at a time. Each reveal publishes an audit event naming who, which record and which field, never the value, and if the event cannot be published, the reveal fails.
- [Audit events](/reference/api/#audit-events): The default queue prints each event as one line and keeps nothing. Plug in a queue of your own to store or forward them.
- [Write-only fields](/reference/access/#write-only-fields): A role can set a field it can never read back, such as an API key only a worker role reads. No response, history entry, export or reveal shows it to the writer.

Who can still read the value: a permitted user, one record at a time, through a reveal. Also anyone who runs SQL on the database or holds a dump, the built-in assistant's SQL tools, and your own server code. The value is stored in plaintext, and a SQL read emits no audit event.

## Encrypted with the app's key

- [Encrypted fields](/reference/data-config/#encrypted-fields): `.encrypted()` makes a text field sensitive and encrypts it with AES-256-GCM and a random IV before it is stored. Dumps, backups, replicas, realtime subscribers and anyone running SQL, the built-in assistant included, see only ciphertext. Only a permitted, audited reveal decrypts it.
- [Bound to its record](/reference/data-config/#what-a-value-is-bound-to): Each value is bound to its table, column, tenant and record. Copied anywhere else, it stays unreadable.
- [Encrypted and write-only](/reference/access/#write-only-fields): Combine the two, and the person who sets a secret cannot read it back. Only the role you name reveals it, and each reveal is audited.
- [Key rotation](/reference/data-config/#the-key): The key can be replaced without downtime. `protobase encryption status` reports what is left under an old key, and `protobase encryption apply` encrypts it again.
- [Your own key when self-hosting](/reference/data-config/#the-key): You set `PROTOBASE_ENCRYPTION_KEY` to 32 random bytes in base64, and keep it apart from the database's backups. A lost key loses its values.
- Your app's key on Protobase Cloud: Each app gets its own key when it is created, rotated on request.

Who can still read the value: a permitted role, one record at a time, through a reveal. This level does not protect against whoever holds the key or the app's environment, or can run code in the server.

## Coming soon

- Sealed for a separate key holder (coming soon): The browser will seal the value for a key-holder service that runs apart from the app. The app and its database will hold only the sealed value, and neither the app's server code nor its plugins will ever get the private key. A reveal will need both the app's access check and the caller's own credential with the key holder, and each attempt will be recorded in a tamper-evident audit record before any value leaves. Self-hosters will run the key holder themselves; running it on Protobase Cloud is planned.
- Sealed with no way to decrypt (coming soon): The browser will seal the value for a public key whose private half lives only with the system that uses it, outside Protobase. Protobase will store the sealed value but will have no way to decrypt it: no reveal, no admin, no server code and no operator. The trade-off is no reveal and no audit event in the app, and replacing that key will mean setting the values again.

## Which level to choose

| Level | Who can still read the value | Does not protect against |
| --- | --- | --- |
| Masked and audited | A permitted user through a reveal; SQL readers, dumps and server code | Anyone with database access |
| Encrypted with the app's key | A permitted role through a reveal | Whoever holds the key or the app's environment, or runs code in the server |
| Sealed for a key holder (coming soon) | A caller the app allows and the key holder knows | Whoever controls the key holder |
| Sealed with no way to decrypt (coming soon) | Only the outside system with the private key | Losing that key, which loses the values |

Running a security review? Send your questions to contact@protobase.net.

<!--
=====================================================================
The copywriter consultant's own page (verbatim), limited to what facts.md v0.17.0 backs. Alternative titles it offered:
- "Sensitive fields and reveals": "Keep a value out of every list, response and search, and reveal it one record at a time with an audit event."
- "Who can read a sensitive value": "What a sensitive field hides, how a reveal works, and who can still read the stored value."
=====================================================================

---
title: Sensitive values
description: How a sensitive field keeps its value out of API responses, how a permitted user reveals it, and who can still read the stored value.
---

You mark a field as sensitive in its resource's `data.ts`, and the server keeps the value out of what the API returns. A permitted user reveals one value at a time, and each reveal emits an audit event. The stored value stays in your database as it is, in plaintext. Use it for values such as bank account numbers that staff need now and then, in a database whose SQL users you already trust.

## Sensitive fields

- [Sensitive fields](/reference/data-config/#sensitive-fields): `.sensitive()` keeps a field's value out of every list, response and search. The record page shows it masked, with an eye button.
- [Reveal](/reference/api/#sensitive-fields-and-audit): A permitted user reveals one record's value at a time with `POST …:reveal`. Each reveal emits a `field.revealed` audit event.

## Who can still read the value

- **A permitted user**, one record at a time, through a reveal. Each reveal emits an audit event.
- **Anyone who runs SQL on the database**, or holds a dump of it. The value is stored in plaintext, and a SQL read is not a reveal, so no audit event is emitted.
- **The built-in assistant's SQL tools.** They run outside access rules and read the stored value.
- **Your own server code** that uses the raw `db` handle in an API function.
- **Not a role the field's access rules leave out.** The field is removed from the API description that role gets, and the API refuses it like an unknown field.

Running a security review? Send your questions to contact@protobase.net.
-->
