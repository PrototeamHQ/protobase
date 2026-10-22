---
title: Data model
description: Describe the tables of an existing Postgres database as resources, with their fields, keys and rules.
---

- [Resources](/reference/data-config/#resource): Each table of an existing Postgres database is described as a resource in TypeScript, with its fields, key and rules. Nothing in the database changes.
- [Field types](/reference/data-config/#field-types): Text, numbers, exact decimals, dates, timestamps, enums, JSON, relations, currencies, countries and files, each mapped to Postgres column types and checked.
- [Composite keys and relations](/reference/data-config/#keys-and-relations): Records can have keys of several columns, and relations can point at them. The admin shows a related record by its name and links to it.
- [Soft delete](/reference/data-config/#resource): Deleting a record marks it with a timestamp instead of removing it. Lists leave it out, and it can be restored.
- [Tenants](/reference/data-config/#resource): A tenant column keeps each organization's records apart. Every query is limited to the caller's tenant, and new records get it set.
- [Record search](/reference/data-config/#resource): You choose which fields text search and the global search look in. Partial words match, and phone numbers match by their last digits.
- [Manual order](/reference/data-config/#resource): Records can be kept in an order set by hand, also per parent record, such as the lines of an invoice.
- [Record validation](/reference/data-config/#resource): A rule over the whole record runs on every create and update and reports each problem on the field it concerns.
- [Rollups and formulas](/reference/data-config/#rollups-and-formulas) (beta): Fields that hold counts, sums, averages, minimums or maximums of related records, or values calculated from the record's own numbers, kept current by the database.
- [Sensitive fields](/reference/data-config/#sensitive-fields): Values such as bank account numbers are left out of every response and shown masked. A permitted user reveals one value at a time, and each reveal is audited.
- [Encrypted fields](/reference/data-config/#encrypted-fields): A sensitive text field is encrypted with the app's own key before it is stored, so dumps, backups and SQL readers see only ciphertext.
- [Encryption key rotation](/reference/data-config/#the-key): The encryption key can be replaced without downtime. CLI commands re-encrypt stored values and report what is left.
- [Extending a config](/reference/cli/#extending-a-config): A project can merge other configs and UI configs into its own. A name defined twice is an error, never a silent override.
