---
title: Jobs and events options
description: The config keys of what the app does in the background and records as it changes, jobs, events, history, webhooks and notifications, with their types and defaults, and the files where a job's run and the stores of its own go.
---

The keys of the app's background work and of what it keeps as records change, at the top level of [`protobase.config.ts`](/reference/config/).

## jobs

- **Type:** `Record<string, JobDeclaration>`
- **Default:** none

The app's jobs by name: what each does, its arguments, when it runs and how it retries. A name is letters, digits, `_`, `-`, `.` and `/`. What the job does is the default export of `jobs/<name>.ts`, typed with `JobRun` from `@protobase/server` and loaded the first time the job runs; a job without its file stops the app at start with an error that names the file. [Jobs](/reference/jobs/) shows a job's config and its `jobs/<name>.ts` side by side.

```ts
export default defineConfig({
  jobs: {
    'send-invoice': { description: 'Mails an invoice to its customer.', arguments: { invoiceId: 'integer' }, maxAttempts: 5 },
    'daily-report': { schedule: '0 7 * * *' },
  },
})
```

Each job takes the keys below.

### description

- **Type:** `string`

What the job does, for the people who read the config and the failed jobs page.

```ts
jobs: { 'send-invoice': { description: 'Mails an invoice to its customer.' } }
```

### arguments

- **Type:** `Record<string, ArgumentSpec>`, each a field type or `{ type, optional?, ... }` with that type's options
- **Default:** none

Its arguments by name, each a [field type](/reference/data-config/#field-types) such as `'bigint'`, or the type with options, such as `{ type: 'enum', values: ['day', 'week'] }` or `{ type: 'integer', optional: true }`. Each is checked when the job is enqueued and again before it runs, and no other argument is taken.

```ts
jobs: { 'send-report': { arguments: { period: { type: 'enum', values: ['day', 'week'] }, userId: 'text' } } }
```

### maxAttempts

- **Type:** `number`
- **Default:** `10`

Tries before the job is kept as failed, listed in the admin app. See [Failures](/reference/jobs/#failures).

```ts
jobs: { 'send-invoice': { maxAttempts: 5 } }
```

### retryDelay

- **Type:** `number | string`
- **Default:** `2s`

The wait before the first retry, doubling with each one: milliseconds, or text such as `30 seconds`.

```ts
jobs: { 'sync-crm': { retryDelay: '30 seconds' } }
```

### maxRetryDelay

- **Type:** `number | string`
- **Default:** `1 hour`

The longest wait between two tries.

```ts
jobs: { 'sync-crm': { maxRetryDelay: '10 minutes' } }
```

### timeout

- **Type:** `number | string`
- **Default:** `15 minutes`

How long one try may run before it counts as failed.

```ts
jobs: { 'import-products': { timeout: '1 hour' } }
```

### longQueries

- **Type:** `boolean`
- **Default:** `false`

Its queries through `db` may run up to 30 seconds instead of the database's own limit, on a connection kept for such work: for imports, backfills, large deletes and other bulk work. See [Long queries](/guides/api-functions/#long-queries).

```ts
jobs: { 'import-products': { longQueries: true } }
```

### concurrency

- **Type:** `number`
- **Default:** `1`

Jobs of this name running at once in each worker process.

```ts
jobs: { 'send-invoice': { concurrency: 4 } }
```

### ordered

- **Type:** `boolean`
- **Default:** `false`

Jobs run one at a time per group, in the order they were enqueued, and every enqueue names its group. Turning it on or off for a job whose queue exists stops the app at start. See [Ordered groups](/reference/jobs/#ordered-groups).

```ts
jobs: { 'sync-order': { ordered: true } }
```

### schedule

- **Type:** `string`, a cron expression

Runs the job on this cron schedule, such as `0 7 * * *` (with an optional seconds field first), with no payload: one run per time, however many workers run. See [Recurring jobs](/reference/jobs/#recurring-jobs).

```ts
jobs: { 'daily-report': { schedule: '0 7 * * *' } }
```

### timezone

- **Type:** `string`
- **Default:** the config's [`timezone`](/reference/config/app/#timezone), else `UTC`

The time zone `schedule` is read in, such as `Europe/Amsterdam`, so 07:00 stays 07:00 across daylight saving time.

```ts
jobs: { 'daily-report': { schedule: '0 7 * * *', timezone: 'Europe/Amsterdam' } }
```

## events.schema

- **Type:** `string`
- **Default:** `changes`

The schema holding the outbox and the capture function that resources' [events](/reference/events/) are raised from, and the prefix of their transaction settings (`changes.actor`, `changes.capture`). Rename it when the database already has a schema by that name; lowercase letters, digits and `_`. See [How changes are captured](/reference/events/#how-changes-are-captured).

```ts
export default defineConfig({ events: { schema: 'app_changes' } })
```

## history.days

- **Type:** `number`, a positive whole number
- **Default:** kept forever

Days a change of a resource with `.history()` is kept; a daily job deletes older ones. See [Record history](/reference/history/#keeping-it).

```ts
export default defineConfig({ history: { days: 365 } })
```

## webhooks

- **Type:** `{ schema?: string; deliveryLog?: boolean; allowPrivateAddresses?: boolean }`
- **Default:** off; `{}` turns them on

Webhook subscriptions that people make in the admin app, kept in a table of the app's database that `protobase migration` writes. A subscription delivers as its owner, with the roles they hold now, read from the app's sign-in; a project that signs people in otherwise exports its own, `async ({ id, tenant }) => [...]`, as the default of `webhooks/owner-roles.ts`. See [Subscriptions in the admin app](/reference/webhooks/#subscriptions-in-the-admin-app).

```ts
export default defineConfig({ webhooks: {} })
```

## webhooks.schema

- **Type:** `string`
- **Default:** `webhooks`

The schema of the subscriptions table and the deliveries view.

```ts
export default defineConfig({ webhooks: { schema: 'hooks' } })
```

## webhooks.deliveryLog

- **Type:** `boolean`
- **Default:** `false`

Also keeps every try, successes too, for 30 days, listed as the Webhook delivery log.

```ts
export default defineConfig({ webhooks: { deliveryLog: true } })
```

## webhooks.allowPrivateAddresses

- **Type:** `boolean`
- **Default:** `false`

Lets subscriptions send to private, loopback and link-local addresses, for development and tests. Off, a URL whose host resolves to one is refused, so a subscription cannot reach the app's own network.

```ts
export default defineConfig(({ command }) => ({ webhooks: { allowPrivateAddresses: command === 'dev' } }))
```

## notifications

- **Type:** `{ ui?: boolean; schema?: string; devices?: { table?: string; columns?: Record<string, string> }; history?: { table?: string; columns?: Record<string, string> } }`
- **Default:** off; `{}` turns them on

Each user's devices and inbox: the bell in the top bar and push on their browsers, over tables that `protobase migration` writes. Web Push is on when the `PROTOBASE_VAPID_*` variables are set. See [Notifications](/reference/notifications/#turning-them-on).

Three files replace the built-in parts, each as its default export: `notifications/store.ts` a device store in place of the devices table, `notifications/history-store.ts` a history store in place of the history table, and `notifications/senders.ts` an array of push senders in place of the built-in ones. See [Your own parts](/reference/notifications/#your-own-parts).

```ts
export default defineConfig({ notifications: {} })
```

## notifications.ui

- **Type:** `boolean`
- **Default:** `true`

The bell in the top bar; `false` keeps only the backend. See [Without the bell](/reference/notifications/#without-the-bell).

```ts
export default defineConfig({ notifications: { ui: false } })
```

## notifications.schema

- **Type:** `string`
- **Default:** `notifications`

The schema of the built-in tables.

```ts
export default defineConfig({ notifications: { schema: 'inbox' } })
```

## notifications.devices

- **Type:** `{ table?: string; columns?: Record<string, string> }`
- **Default:** `{ table: 'devices' }`

The devices table: its name, and its columns named otherwise than Protobase names them. See [Table names](/reference/notifications/#table-names).

```ts
export default defineConfig({ notifications: { devices: { table: 'push_devices', columns: { user_id: 'owner_id' } } } })
```

## notifications.history

- **Type:** `{ table?: string; columns?: Record<string, string> }`
- **Default:** `{ table: 'history' }`

The history table, each user's inbox: its name, and its columns named otherwise than Protobase names them.

```ts
export default defineConfig({ notifications: { history: { table: 'inbox_items' } } })
```
