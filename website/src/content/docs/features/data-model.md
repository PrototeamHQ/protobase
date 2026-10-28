---
title: Data model
description: Describe the tables of an existing Postgres database as resources, with their fields, keys and rules.
---

- [Resources](/reference/data-config/#resource): Each table or view of an existing Postgres database is described as a resource in TypeScript, with its fields, key and rules. Nothing in the database changes.
- [Snake case names](/reference/data-config/#resource): Scaffold names resources and fields after their tables and columns, such as `stock_moves` and `moved_at`, and the built-in resources are named the same way, so the names in URLs and the API match the database.
- [Field types](/reference/data-config/#field-types): Text, numbers, exact decimals, booleans, dates, timestamps, UUIDs, enums, JSON, relations, currencies, countries and files, each mapped to Postgres column types and checked.
- [Field options](/reference/data-config/#field-options): A field can be optional, read-only, given a default by the app or the database, filterable and sortable where an index serves it, known by other names, and read from a column of another name.
- [Composite keys and relations](/reference/data-config/#keys-and-relations): Records can have keys of several columns, and relations can point at them. The admin shows a related record by its name and links to it.
- [Soft delete](/reference/data-config/#resource): Deleting a record marks it with a timestamp instead of removing it. Lists leave it out, and it can be restored.
- [Tenants](/reference/data-config/#resource): A tenant column keeps each organization's records apart. Every query is limited to the caller's tenant, and new records get it set.
- [Record authors](/reference/data-config/#resource): A record can keep who created it. The server sets it to the signed-in user on every create, and no request can set or change it.
- [Record search](/reference/data-config/#resource): You choose which fields text search and the global search look in. Partial words match, and phone numbers match by their last digits.
- [Manual order](/reference/data-config/#resource): Records can be kept in an order set by hand, also per parent record, such as the lines of an invoice.
- [Opening an existing record](/reference/data-config/#opening-an-existing-record): A create that repeats a record's unique values, such as a direct message with the same people, opens that record instead of failing, for whoever may read it; anyone else gets the usual conflict, which does not say the record exists.
- [Record validation](/reference/data-config/#resource): A rule over the whole record runs on every create and update and reports each problem on the field it concerns.
- [Rollups and formulas](/reference/data-config/#rollups-and-formulas) (beta): Fields that hold counts, sums, averages, minimums or maximums of related records, or values calculated from the record's own numbers, kept current by the database.
- [Sensitive fields](/reference/data-config/#sensitive-fields): Values such as bank account numbers are left out of every response and shown masked. A permitted user reveals one value at a time, and each reveal is audited.
- [Recent strong sign-in](/reference/data-config/#recent-strong-sign-in): A sensitive field can ask for a passkey or a second step in the last minutes before it is revealed. The record page asks the person to confirm it's them, then shows it.
- [Computed reveals](/reference/data-config/#computed-reveals) (beta): A secret kept elsewhere, or built from several values, is revealed like a sensitive field, with the same access, audit and recent sign-in check, but made when it is asked for.
- [Encrypted fields](/reference/data-config/#encrypted-fields): A sensitive text field is encrypted with the app's own key before it is stored, so dumps, backups and SQL readers see only ciphertext. A command encrypts the values a column already holds.
- [Encryption key rotation](/reference/data-config/#the-key): The encryption key can be replaced without downtime. CLI commands re-encrypt stored values and report what is left.
- [Schema API reference](/reference/data-config/#schema-api-reference): Every builder, option and type of `@protobase/schema` has a doc comment, shown in your editor and in the generated API reference, and the types the builders return are exported for helpers of your own.
- [Extending a config](/reference/cli/#extending-a-config): A project can merge other configs and UI configs into its own. A name defined twice is an error, never a silent override.
