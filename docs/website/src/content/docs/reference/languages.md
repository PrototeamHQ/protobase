---
title: Languages
description: The admin app's built-in screens come in English and Dutch, chosen by the app or by each user's browser, with numbers and dates written to match, and the app's own texts in any language it has translations for.
---

The admin app's own texts and its numbers and dates come in English and Dutch. The texts you write yourself, such as resource names, labels and enum value labels, show as you write them, in any language, unless the app's [translations](#your-own-texts) give them in the reader's.

## Choosing the language

Without a setting, each user sees the app in their browser's language when it is Dutch or English, and in English otherwise. `locale` in `protobase.config.ts` puts the app in one language for everyone:

```ts title="protobase.config.ts"
import { defineConfig } from '@protobase/config'

export default defineConfig({ locale: 'nl' })
```

The value is `'en'` or `'nl'`, and the server refuses to start with any other value. `/meta` names the language as `locale`, and so does the sign-in status (`GET /api/auth/status`), which the sign-in screens and public forms read before `/meta`, so they are in the same language.

## Numbers and dates

Numbers, amounts and dates use the conventions of the language: English as written in Britain (`6 Oct 2026`, `€1,234.56`), and Dutch as written in the Netherlands (`6 okt 2026`, `€ 1.234,56`). Typing a decimal number in a form uses the same decimal mark. Times show in the viewer's time zone in both languages.

## Your own texts

The app's own texts, its pages' and its labels, come in every language it has translations for: one JSON file per language, its messages ICU, as `intl-messageformat` reads them, exported from `config/index.ts` with `translations`:

```ts title="config/index.ts"
import { translations } from '@protobase/layout'
import en from './texts/en.json'
import nl from './texts/nl.json'

export const texts = translations({ en, nl })
```

```json title="config/texts/nl.json"
{
  "today": {
    "title": "Vandaag",
    "open": "{count, plural, one {# open taak} other {# open taken}}",
    "owner": "Van <b>{name}</b>"
  },
  "resources": {
    "tasks": {
      "names": { "singular": "Taak", "plural": "Taken" },
      "fields": { "status": { "label": "Staat", "values": { "done": "Klaar" } } }
    }
  }
}
```

A layout shows a message with [`<Trans i18nKey="today.open" values={{ count: 2 }} />`](/reference/layouts/#texts-in-the-readers-language), and a page whose `title` is one is named by it in the sidebar too. A view's labels take their key from where they sit, under `resources.<resource>`: `names.singular` and `names.plural`, `help`, `fields.<field>.label`, `.help` and `.values.<value>`, `layout.<index>.title`, `.help` and `.empty` (a tab's items under `layout.<index>.items.<index>`), and `actions.<action>.label` and `.confirm`. A label the translations leave out shows as the view writes it.

Each reader gets the app's own `locale` when it sets one the translations have, else the first of their browser's languages the translations have, by its tag or its language (`nl-BE` reads `nl`), else English, else the first language. A language is any BCP 47 tag, such as `de` or `pt-BR`, while the built-in screens stay in English or Dutch. `/meta` serves the reader's language and only the messages their pages name, as `texts: { locale, messages }`, with the page titles and labels already in it.

The config fails to load when a message is not ICU or a language lacks a key another has, and the server refuses to start when a layout names a key no language has, leaves out a value its message formats in some language, or has a tag with no element in `components`, naming the page or view.

## What is translated

Every built-in screen is translated: the shell with its sidebar, top bar, search, notification bell, profile menu and bottom bar; the list page with all its displays (table, cards, board, calendar, timeline and map), filters, search, sort, imports and exports; the record page with its actions, related lists, history, comments, gallery, saving, conflicts and deleting; the create page and composed pages; saved searches and favorites; the sign-in, sign-up and two-factor screens, the account and sign-in policy pages, and the organization, people and invitation pages; public forms; the assistant's dock and a record's [lines](/reference/ui-config/#record-lines); the notice naming a plugin that is off and why; and the messages, toasts and confirmations around them. The parts `@protobase/ui` gives your own components, such as the [form parts](/reference/custom-components/#form-parts), the [chat parts](/reference/custom-components/#chat-parts) and the markdown editor, come in the app's language too. So are counts, relative times ("5 minutes ago"), yes, no and the other values the app writes itself, and the notices shown while the app loads.

The screens where people add [tables of their own](/reference/user-tables/#in-the-admin-app) are translated too: the tables list, a table's page with its fields, and the forms that make a table and a field, with the names of the field types. So are the other lists Protobase adds beside your resources, failed jobs, activity and comments, with their record pages, sections and actions.

Protobase's [own emails](/reference/email/#protobases-own-mail) are translated too: the sign-in, two-factor, sign-up and confirmation codes, the notes to an address that has an account or has none, password reset and the note that a password changed, invitations, staff sign-in notices and the email to someone a comment mentions. An auth email is in the app's `locale`, or else in the language of the browser that asked for it; the mention email is in the app's `locale`, or else in English.

The approvals an AI client asks for over [MCP](/reference/mcp/#writes) are translated too, with their buttons and the refusal for a client that cannot ask: in the app's `locale`, or else in the language the client's request accepts.

The other texts a plugin or the server writes itself, such as an error message the API sends back, show as they are written.
