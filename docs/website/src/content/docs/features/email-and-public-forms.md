---
title: Email and public forms
description: Mail the app sends, the PDF documents it makes, and forms for people without an account.
---

- [Email](/reference/email/#configuration): The app sends mail through one SMTP server or a mailer you supply. [Sending returns the message id](/reference/email/#message-id), so you can match a later reply, bounce or complaint to the mail it answers.
- [Built-in emails](/reference/email/#protobases-own-mail): Sign-in codes, password resets, invitations and mentions are sent in the app's name, in English or Dutch.
- [Email templates](/reference/email/#templates) (beta): Your own emails are templates with typed data, written in mail blocks with their texts in each language they are sent in, checked by a schema of yours or the data they read, and sent from jobs, hooks, functions or a workflow's Send email step.
- [Emails in React](/reference/email/#emails-in-react): An email can be a React component with typed data instead, for a layout the mail blocks cannot draw.
- [Protobase's mail look](/reference/email/#the-look-of-protobases-own-mail): Your emails use a layout, button, code and note with the look of Protobase's own mail.
- [Header fields](/reference/email/#templates): Your emails carry header fields of their own.
- [One-click unsubscribe](/reference/email/#unsubscribe) (beta): Mail you mark as bulk carries a one-click unsubscribe, and Protobase stops sending that kind of mail to whoever used it.
- [Bounces and complaints](/reference/email/#bounces-and-complaints) (beta): Bounces and spam complaints that Amazon SES or Resend report arrive as Mail feedback records with `bounced` and `complained` events, so a workflow, webhook or your own code can act on them.
- [Attachments](/reference/email/#attachments): A message carries files, such as an invoice's PDF, through the app's mail or someone's own mailbox.
- [PDF documents](/reference/pdf/#documents): PDF files such as invoices and quotes are React components with typed data, rendered from jobs, hooks or functions and attached to mail as they are.
- [Mail from your own mailbox](/reference/email/#from-someones-own-mailbox) (beta): People link their Gmail on the account page, and the app's functions send mail from it; an action offers to connect the mailbox right there when the link is missing or expired.
- [From addresses](/reference/email/#from-addresses): People enter their mailbox's other send-as addresses once on the account page, each with a display name and a signature of its own, and the app sends from the one it names or their default.
- [Public forms](/reference/forms/#what-the-visitor-sees): A form at its own address lets people without an account create a record, such as a contact request.
- [Bot check](/reference/forms/#bot-check): Each submission passes a check in the browser, without a third-party service or a puzzle.
- [Form rate limit](/reference/forms/#rate-limit): Each client sends only a set number of submissions per minute.
