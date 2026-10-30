---
title: Email and public forms
description: Mail the app sends, and forms for people without an account.
---

- [Email](/reference/email/#configuration): The app sends mail through one SMTP server or a mailer you supply.
- [Built-in emails](/reference/email/#protobases-own-mail): Sign-in codes, password resets, invitations and mentions are sent in the app's name.
- [Email templates](/reference/email/#templates): Your own emails are React components with typed data, sent from jobs, hooks or functions.
- [Attachments](/reference/email/#attachments): A message carries files, such as an invoice's PDF, through the app's mail or someone's own mailbox.
- [Mail from your own mailbox](/reference/email/#from-someones-own-mailbox) (beta): People link their Gmail on the account page, and the app's functions send mail from it, with a clear error when the link is missing or expired.
- [Public forms](/reference/forms/#what-the-visitor-sees): A form at its own address lets people without an account create a record, such as a contact request.
- [Bot check](/reference/forms/#bot-check): Each submission passes a check in the browser, without a third-party service or a puzzle.
- [Form rate limit](/reference/forms/#rate-limit): Each client sends only a set number of submissions per minute.
