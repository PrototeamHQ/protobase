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
- [Bounces and complaints](/reference/email/#bounces-and-complaints) (beta): Bounces and spam complaints that Amazon SES or Resend report arrive as Mail feedback records with `bounced` and `complained` events, a complaint that hides who complained tied to the message it is about, so a workflow, webhook or your own code can act on them.
- [Attachments](/reference/email/#attachments): A message carries files, such as an invoice's PDF, through the app's mail or someone's own mailbox.
- [PDF documents](/reference/pdf/#documents): PDF files such as invoices and quotes are React components with typed data, rendered from jobs, hooks or functions and attached to mail as they are.
- [Mail from your own mailbox](/reference/email/#from-someones-own-mailbox) (beta): People link their Gmail on the account page, and the app's functions send mail from it; an action offers to connect the mailbox right there when the link is missing or expired.
- [From addresses](/reference/email/#from-addresses): Each send-as address is a record on the person's mailbox, with a display name, a signature of its own and a state. With the optional `gmail.settings.basic` scope, Gmail lists them and says which it really sends from, and the app refuses to send from an address Gmail would replace. The app sends from the record it names, or the person's default.
- [Verifying a From address](/reference/email/#verifying-a-from-address) (beta): The app plugs in its own way to prove a From address its mailbox provider cannot vouch for, such as a hosting platform's test-mail check: a verifier sends one test message through the person's mailbox, and its proof makes the address verified until it runs out. Verifications wait, survive a restart and settle once, by the app's own check each minute or by a report carrying the verification's secret.
- [Sharing a From address](/reference/email/#sharing-a-from-address) (beta): The owner of a verified From address, such as a team's billing address, shares it with the app's other senders, or with organizations those in an organization with them. They pick it like their own and send from it through the owner's mailbox, which stays hidden from them, until it is unshared or no longer verified.
- [A From address on a record](/reference/email/#a-from-address-on-a-record) (beta): A field such as a client's "Send from" is a dropdown of the person's addresses with their states, and an address a record holds cannot be removed.
- [Public forms](/reference/forms/#what-the-visitor-sees): A form at its own address lets people without an account create a record, such as a contact request.
- [Bot check](/reference/forms/#bot-check): Each submission passes a check in the browser, without a third-party service or a puzzle.
- [Form rate limit](/reference/forms/#rate-limit): Each client sends only a set number of submissions per minute.
