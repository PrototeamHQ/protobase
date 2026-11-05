---
title: Importing records from a spreadsheet
description: Bring a spreadsheet of companies into the admin app with the list's Import, update them from another, make a new table from a file, and turn Import off where it does not belong.
---

Rijnland's sales team keeps a spreadsheet of companies they met at a trade fair, and wants them in the ERP example (`tests/apps/erp`) without typing each one. Every list offers **Import** to a user who may create its records, so there is nothing to build: this guide walks through an import, an update from a second file, a new table from a file, and turning Import off. The [reference](/reference/ui-config/#importing-records) has every rule.

## 1. Import new records

Save the spreadsheet as it is (`.xlsx`), or as **CSV UTF-8**. Its first row names the columns:

| Name | City | Country | Status | Email |
| --- | --- | --- | --- | --- |
| Hoogland Fietsen | Leiden | NL | Lead | inkoop@hoogland.test |
| De Spaak | Delft | NL | lead | |

Data exported from another tool as JSON imports the same way: an array of objects, whose keys name the columns, such as `[{"Name": "Hoogland Fietsen", "City": "Leiden"}]`.

Open **Companies**, press **Import** and choose the file. Each column whose header is a field's label or name is mapped already: Country is the label the companies' view gives `country_code`, a relation whose column holds each country's key. Map other columns, or leave them at **Do not import**. Set **Numbers** and **Dates** to how the file writes them. Fields a new company needs that no column fills are named above **Check rows**, which waits for them.

**Check rows** reads the whole file and writes nothing. It shows the first rows as they will be saved and lists each row with a problem, such as a country no record has or a status that is none of Lead, Active and Dormant (`lead` is fine: case and spacing do not count). Those rows are skipped. An empty Email is saved empty; an empty cell is never filled with a default.

**Import** saves the rows in batches of 100, each batch on its own. A row the server refuses is listed with the server's reason while the rest are saved, and **Cancel import** stops after the batch it is in. The summary counts what was created, updated, skipped and failed; **Download** gives the rows not imported, with their line in the file and why, to fix and import again.

## 2. Update records from a file

A second sheet has the companies' VAT numbers, by name:

| Name | VAT number |
| --- | --- |
| Hoogland Fietsen | NL001234567B01 |

Choose **Update** under **Rows**, then **Find records by** Name and **Found in column** Name. Name is a filterable field, so the import can look the companies up; a name two companies share is a problem on its row rather than a guess. A row whose name finds no company is not imported; **Create or update** would create it instead.

## 3. Make a new table from a file

The team also keeps a sheet of trade fair contacts that fits no list the app has. In an app with [user tables](/reference/user-tables/) on, someone who may add tables opens **Tables**, presses **From a file** and chooses it:

| Name | Visits | Met on | Phone |
| --- | --- | --- | --- |
| Hoogland Fietsen | 3 | 2026-03-01 | 0612345678 |

Each column proposes a field, typed only from what its cells hold: Visits becomes a whole number and Met on a date, while Phone stays text, as `0612345678` starts with a zero a number would drop. A value such as `1,5` or `03/04/2026`, which could be read two ways, keeps its column text too. Give the table a singular label, such as Contact, change any name, label or type, or leave a column out, and press **Make table**. The table and its fields are made in one go, the rows are written as an import writes them, and you land on the new table's list. The [reference](/reference/user-tables/#a-table-from-a-file) has every rule.

## 4. Turn Import off

When a list's records should never come from a file, such as invoices that only orders should make, turn its Import off in the view:

```ts
// invoices/ui.ts
export const invoicesView = view<typeof invoices>('invoices').import(false)
```

Turning it off removes the button, not a right: the API takes the same writes from any client, and the server checks each one, so a user who may not create a record, or write one of its fields, is refused per row as on the record page.
