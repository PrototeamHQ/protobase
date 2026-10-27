---
title: Your own code
description: React components, field types, pages and handlers of your own, loaded as plugins.
---

- [Custom components](/reference/custom-components/#components): Your own React components used by name in layouts, reading data under the user's access.
- [Custom list displays](/reference/custom-components/#list-displays): Draw a list with your own component while the list page keeps loading, filters, search and paging.
- [Custom record sections](/reference/custom-components/#record-sections): Your own component on a record page, beside its sections.
- [Custom record cards](/reference/custom-components/#record-cards): Draw each card with your own component, with the built-in card as the fallback.
- [Custom field types](/reference/plugins/#field-types): Register how a kind of value is shown and edited, and pick it per field in a view.
- [Custom create pages](/reference/custom-components/#create-pages): Replace a resource's create form with your own page, such as a booking flow.
- [Form parts](/reference/custom-components/#form-parts): Build your own forms from the app's fields, pickers, switches, buttons and dialogs.
- [Image carousel](/reference/custom-components/#image-carousel): Step through screenshots or a record's files in your own components by swiping or with arrows, as cards step through photos.
- [Assistant parts](/reference/assistant/#in-the-ui): The assistant's panel, chat messages, composer and action cards for your own components, with a frameless action card for a page that is already framed.
- [Chat parts](/reference/custom-components/#chat-parts): A chat between people from the app's parts: messages with their author, avatar, time and a status line, day and new-message lines, a thread that loads earlier messages and keeps the reader's place, and a composer of several lines with @mentions.
- [Action handlers](/reference/custom-components/#action-handlers): Your own code for a named action, with the record, the API client and the action's inputs.
- [Shell slots](/reference/custom-components/#shell-slots): Your own components in the top bar, in a panel beside every page, or as the sidebar logo.
- [Plugins](/reference/plugins/#how-a-plugin-stays-working): Your React code is a plugin that the app loads at start and that keeps working across Protobase releases without changes.
- [Plugin settings](/reference/plugins/#loading): Plugins are loaded from the config, limited to roles and given settings.
- [Plugin fallbacks](/reference/plugins/#when-a-plugin-is-off): A plugin that fails or does not fit the version is turned off alone, and admins see why.
- [Before sign-in](/reference/plugins/#before-sign-in): A plugin can run around the sign-in page, for example to sign someone in from a link.
