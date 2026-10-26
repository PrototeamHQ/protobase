---
title: Languages
description: The admin app's built-in screens come in English and Dutch, chosen by the app or by each user's browser, with numbers and dates written to match.
---

The admin app's own texts and its numbers and dates come in English and Dutch. The texts you write yourself, such as resource names, labels and enum value labels, show as you write them, in any language.

## Choosing the language

Without a setting, each user sees the app in their browser's language when it is Dutch or English, and in English otherwise. `locale` in `protobase.config.ts` puts the app in one language for everyone:

```ts title="protobase.config.ts"
import { defineConfig } from '@protobase/config'

export default defineConfig({ locale: 'nl' })
```

The value is `'en'` or `'nl'`, and the server refuses to start with any other value. `/meta` names the language as `locale`, and so does the sign-in status (`GET /api/auth/status`), which the sign-in screens and public forms read before `/meta`, so they are in the same language.

## Numbers and dates

Numbers, amounts and dates use the conventions of the language: English as written in Britain (`6 Oct 2026`, `€1,234.56`), and Dutch as written in the Netherlands (`6 okt 2026`, `€ 1.234,56`). Typing a decimal number in a form uses the same decimal mark. Times show in the viewer's time zone in both languages.

## What is translated

Every built-in screen is translated: the shell with its sidebar, top bar, search, notification bell, profile menu and bottom bar; the list page with all its displays (table, cards, board, calendar, timeline and map), filters, search, sort, imports and exports; the record page with its actions, related lists, history, comments, gallery, saving, conflicts and deleting; the create page and composed pages; saved searches and favorites; the sign-in, sign-up and two-factor screens, the account and sign-in policy pages, and the organization, people and invitation pages; public forms; and the messages, toasts and confirmations around them. So are counts, relative times ("5 minutes ago"), yes, no and the other values the app writes itself, and the notices shown while the app loads.

The texts a plugin or the server writes itself, such as an error message the API sends back or why a plugin could not be loaded, show as they are written.
