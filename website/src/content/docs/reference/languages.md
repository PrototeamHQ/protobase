---
title: Languages
description: The admin app's built-in screens come in English and Dutch, chosen by the app or by each user's browser, with numbers and dates written to match.
---

The admin app's own texts and its numbers and dates come in English and Dutch. The texts you write yourself, such as resource names, labels and enum value labels, show as you write them, in any language.

## Choosing the language

Without a setting, each user sees the app in their browser's language when it is Dutch or English, and in English otherwise. `options.locale` in `protobase.config.ts` puts the app in one language for everyone:

```ts title="protobase.config.ts"
export default { config, auth, authenticate, options: { locale: 'nl' } }
```

The value is `'en'` or `'nl'`, and the server refuses to start with any other value. `/meta` names the language as `locale`. The sign-in screens come before `/meta`, so they follow the browser.

## Numbers and dates

Numbers, amounts and dates use the conventions of the language: English as written in Britain (`6 Oct 2026`, `€1,234.56`), and Dutch as written in the Netherlands (`6 okt 2026`, `€ 1.234,56`). Typing a decimal number in a form uses the same decimal mark. Times show in the viewer's time zone in both languages.

## What is translated

The shell is translated: the sidebar, the top bar, search, the profile menu and the bottom bar. So are the counts, relative times ("5 minutes ago") and the notices shown while the app loads.

So are the list page with its table, filters, search, sort, display switch and sorting by hand; the record page with its actions, related lists, saving, conflicts and deleting; the create page; the messages under a field the server turned down; yes, no and other values the app writes itself; and public forms. A public form comes before `/meta`, so like the sign-in screens it follows the browser.

Imports, exports, charts, history, comments, the other list displays (cards, board, calendar, timeline, map), composed pages, and the sign-in, account and organization screens are still in English. Their texts are being translated to Dutch one area at a time.
