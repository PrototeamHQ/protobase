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
- [Webhook delivery log](/reference/webhooks/#subscriptions-in-the-admin-app): Every try of the admin app's subscriptions, successes too, is kept for 30 days with its status and timing, when the app turns it on.
- [Background jobs](/reference/jobs/#enqueueing): Jobs are kept in the app's own Postgres and can be queued in the same transaction as a write, also from SQL.
- [Typed jobs](/reference/jobs/#typed-names-and-payloads): Code that queues a job, and the job itself, are checked against the names and arguments the config declares as they compile.
- [Retries](/reference/jobs/#failures): Failed jobs are retried with growing waits, and duplicates can be prevented with a key.
- [Ordered groups](/reference/jobs/#ordered-groups): Jobs in one group run one at a time, in order.
- [Recurring jobs](/reference/jobs/#recurring-jobs): Jobs run on a cron schedule in a chosen time zone.
- [Failed jobs page](/reference/jobs/#failed-jobs-page): Admins see jobs that failed for good and retry or delete them.
- [Worker process](/reference/jobs/#where-jobs-run): Jobs and event deliveries run beside the API, or in a worker process of their own from the same bundle.
- [Derived values](/reference/derived/) (experimental): A TypeScript function's result stays current by itself; Protobase records what it read and recomputes it when that changes or when a time rule flips.
- [Jobs on hosts that sleep](/reference/jobs/#hosts-that-sleep): A host that stops idle apps can wake them when a job is due.
