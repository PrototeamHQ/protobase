---
title: Events, webhooks and jobs
description: React to changes, deliver them to other systems, and run work in the background.
---

- [Events](/reference/events/#declaring-events): A resource declares named events, such as an order that was created or a status that changed.
- [Change capture](/reference/events/#how-changes-are-captured): Every change is captured in the database, in the same transaction, whoever made it.
- [Webhooks](/reference/webhooks/#subscription): Events are sent to a URL, an API function or your own code, filtered by event, condition and tenant.
- [Signed webhooks](/reference/webhooks/#what-a-receiver-gets): Deliveries are signed under the Standard Webhooks spec.
- [Delivery retries](/reference/webhooks/#delivery-and-retries): Failed deliveries are retried for about three days.
- [Webhooks in the admin app](/reference/webhooks/#subscriptions-in-the-admin-app): Users create subscriptions, send test events and resend failures in the app.
- [Background jobs](/reference/jobs/#enqueueing): Jobs are kept in the app's own Postgres and can be queued in the same transaction as a write, also from SQL.
- [Retries](/reference/jobs/#failures): Failed jobs are retried with growing waits, and duplicates can be prevented with a key.
- [Ordered groups](/reference/jobs/#ordered-groups): Jobs in one group run one at a time, in order.
- [Recurring jobs](/reference/jobs/#recurring-jobs): Jobs run on a cron schedule in a chosen time zone.
- [Failed jobs page](/reference/jobs/#failed-jobs-page): Admins see jobs that failed for good and retry or delete them.
- [Jobs on hosts that sleep](/reference/jobs/#hosts-that-sleep): A host that stops idle apps can wake them when a job is due.
