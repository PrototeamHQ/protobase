---
title: Realtime relay
description: Hand the app's realtime connections to a relay, so the app and its database can sleep while people stay connected.
---

The app can hand its realtime connections to a relay, the open source [protobase-realtime](https://github.com/PrototeamHQ/protobase-realtime) server: the relay holds everyone's WebSocket, and the app talks to it only when something changes, so a quiet app and its database sleep while people stay connected. The relay keeps no data and never reads the app's database: the app tells it who is in which channel, what changed and for whom, and which sign-in sessions ended. It works beside the app's own [channels](/reference/channels/) and [live updates](/reference/live/), which stay as they are.

:::caution[In development]
The app's side is built: tickets, membership, change notices, session ends, presence and the [events clients send each other](#client-events), and so are pages' side in `@protobase/client` and the admin app: [live updates, typing and unread marks](#pages).
:::

## Config

```ts
export default defineConfig(({ env }) => ({
  realtime: {
    relay: {
      url: env.RELAY_URL!,
      app: 'chat',
      apiKey: env.RELAY_API_KEY!,
      ticketKey: env.RELAY_TICKET_KEY!,
      channels: {
        conversations: {
          members: { resource: 'conversation_members', channel: 'conversation_id', user: 'user_id' },
          mentions: 'mentions',
          events: { ring: { schema: { type: 'object', properties: { call: { type: 'integer' } } }, maxBytes: 128, perSecond: 1, burst: 2 } },
        },
        rooms: {},
      },
      presence: { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: env.RELAY_PRESENCE_KEY! },
    },
  },
}))
```

| Key | |
| --- | --- |
| `url` | The relay's address, `https://` or `http://`. The app sends its commands there, and clients connect to its `/socket`. |
| `app` | The app's id on the relay: 1 to 64 of `a-z`, `0-9`, `_` and `-`. |
| `apiKey`, `ticketKey` | One of the app's API keys and one of its ticket keys on the relay, each at least 32 characters. |
| `channels` | The channel resources, by name. Each record of one is a channel, `<resource>/<key>`, named as its [record channel](/reference/channels/) is; the resource needs a key of one field. |
| `channels.<resource>.members` | Where the channel's members come from: a resource whose records each put one person in one channel, with its relation field to the channel resource (`channel`) and its field of the person's user id (`user`). Index both columns: tickets read by the user, notices by the channel. Without `members`, the channel is open: a channel of a public record, which tickets list when asked (see [Tickets](#tickets)). |
| `channels.<resource>.mentions` | A field of the records noticed on the channel that lists the user ids they mention, an array or one id, which [notices](#notices) carry. |
| `channels.<resource>.events` | The [events](#client-events) the channel's members may send each other, by name, each with its payload's `schema`, its `maxBytes` and the rate one person may send it at, `perSecond` in bursts of `burst`. |
| `presence` | Turns on [presence](#presence): the app's own resource it is kept in, its fields of the person's user id (`user`), the status (`status`) and when it began (`at`), and the bearer token of the relay's reports (`key`), at least 32 characters. |

The relay needs the app's own [sign-in](/reference/auth/), whose sessions its tickets name, with its store in the app's own database, as the `auth` config puts it: an auth store in another database is refused. A members resource's changes must be captured, so declare [`.live()`](/reference/live/) on it; the relay hears of the changes of every resource whose changes are captured, such as a live one, that is a channel resource or has a relation field to one. [`protobase migration`](/reference/cli/#migration) writes the trigger that ends a deleted session's sockets, in the `relay` schema, after the auth store's steps when the same file writes them, so a new app's first migration sets up both; the server checks it at start.

[`protobase relay app`](/reference/cli/#relay-app) prints the app's entry for the relay's apps file, from this config and the app's `url`.

## Local development

[`protobase dev`](/reference/cli/#dev) runs a relay of its own when `realtime.relay` has no `url`, such as with `RELAY_URL` unset in `.env`, so local realtime needs no second command. Add the relay's npm package to the project once:

```sh
npm install --save-dev @protobase/realtime
```

<gap>`protobase dev` cannot run the relay without the project installing `@protobase/realtime` because the CLI does not depend on it until the package is published.</gap>

It starts the relay on the first load of a config with `realtime.relay`, an edit that adds it included, on a free port of `127.0.0.1`, serving this one app with the dev server's origin, and gives the app its address. The keys are the config's when it sets them, and otherwise made anew for each `protobase dev`. An edit that changes the app's id or keys starts it again, one that removes `realtime.relay` or sets a `url` stops it, and it stops with `dev`. Its own messages, such as an apps file it refuses, show in the terminal. With a `url`, the app uses that relay and `dev` starts none.

## Tickets

A client connects to the relay with a ticket from `POST /api/relay/ticket`, with `{ "channels": [...] }`, optional, as JSON. The answer is `{ ticket, url, channels, expiresAt }`: the relay's socket address, a ticket that connects once, within a minute, and the channels it lists, which the client joins. Every connection, a reconnect too, takes a new ticket.

- **Signed in:** the ticket names the person and the sign-in session they called with, so a device that connects makes no new session, and lists every channel they are a member of, as the members resources hold it, and `people`, which every signed-in person has and [presence](#presence) is published on. A caller without a session of the app, such as an API key or an outside app acting for the user, is refused with `403`; a session that ended with `401`.
- **Visitors:** with an `anonymous` role, a caller without a token gets a ticket of an anonymous session of its own, which receives and never sends.
- **Open channels:** both list the channels they ask for in `channels` of resources without `members` whose records are public: the `anonymous` role may read them, as `GET /api/v1/<resource>/<key>` decides it for a visitor. Someone's own access to a record never makes its channel open, so no one's access to one can end while their socket stays open. A channel there is none of, one whose record is not public and one of a resource with members are refused alike with `404`; a record only some people may read takes `members`. A ticket lists at most 200 channels (`400`, or `422` when the memberships are more).

## Notices

The [dispatch](/reference/events/) that turns each transaction's changes into events also hands them to the relay: in its own transaction it reads each change's audience once, from the members tables, and queues one `relay.send` job with the commands for the batch. A record of a channel resource is noticed on its own channel, and a record of a resource with a relation to one on the channel it points at, both where it was and where it moved. Each notice is one `change` event to the channel, the same bytes to every socket it reaches:

```json
{ "kind": "create", "resource": "messages", "key": "42", "channel": "conversations/7", "mentions": ["u2"] }
```

`kind` is `create`, `update`, `delete` or `undelete`; `mentions` is there with `mentions` set. A notice tells clients what changed, so they read only the records they show. On a channel with members it reaches its members as the database holds them at dispatch, and a person who joined or left with that change; on an open channel, everyone joined to it, while the anonymous role reads its record as it stands at dispatch. The relay sends a notice once, however often the job sends it again.

A members record that is created or undeleted adds its person to the channel on the sockets they have open, before its notice, and one that is deleted or soft-deleted takes them out after it: they can join, or are closed out, without connecting again. The person added, and no one else, also hears a `joined` event on `people` that names the channel, `{ "channel": "conversations/7" }`, so their pages join it. Commands go in commit order, one job at a time; while the relay is down, they wait and try again, once a minute at most. A command the relay refuses, such as one over its size limit, goes to the app's error reporter and is passed over.

Once an open channel's record stops being public, its notices stop, and a new ticket refuses it. <gap>Sockets that joined an open channel stay joined after its record stops being public, hearing nothing of it, until they reconnect, because closing a channel on every socket is not implemented.</gap>

## Sessions

When a sign-in session ends, its sockets close: a trigger on the sessions table queues a `relay.close-sessions` job in the deleting transaction, for a sign-out, a revoke, a ban, a newer sign-in in the same browser or a delete in SQL alike, and the job tells the relay to close them. A ticket also queues a `relay.session-expiry` job for its session's expiry, once for each session: it closes the session's sockets once the session expired, and waits for the new expiry of one that was extended meanwhile. The person's other sessions stay connected. The relay itself keeps no timers.

## Presence

With `presence`, the relay reports who comes online, goes away and goes offline, combined over their devices, and the app keeps it in a resource of its own, one record per person:

```ts
export const presences = resource('presences')
  .fields({ user_id: f.text(), status: f.enum(['online', 'away', 'offline']), since: f.timestamp() })
  .primaryKey((r) => r.user_id)
  .live()
  .events((e) => [e.updated('wentOffline', { when: 'status = "offline"' })])
```

The resource is keyed by its user field, its status field is text or an enum of `online`, `away` and `offline`, and its `at` field a timestamp; its changes must be captured, such as with [`.live()`](/reference/live/). The server refuses to start otherwise. Protobase adds no table of its own.

Only the relay writes the records, so give no role `presences.create`, `presences.update` or `presences.delete`: whoever may write one can set anyone's presence and raise its events. A role that reads the resource reads the presence of everyone its rows allow, which can reach further than `people` does, so grant `presences.read` no wider than that.

The relay posts its reports to `POST /api/relay/presence` with the presence key as its bearer token, never a sign-in; the [apps file entry](/reference/cli/#relay-app) names the address. A report holds at most 500 changes, each a person's status and when it began. The app writes them in one statement, which replaces a record's status only with one that began later, and answers `204`: a report the relay sends again, or one that arrives late, changes nothing. A report with a missing or wrong key is refused with `401` before its body is read. To change the key, change it in the config and in the apps file; the relay sends a refused report again, waiting up to a minute between tries, until the app takes it, so no change is lost. When the relay restarted, which a report says with its start time, everyone it has not reported since and who is not offline yet is set offline as of that start, once in each server process for each start; the relay sends no report until someone's status changes, so this waits for the first one.

Each write goes through the resource's table, so its changes raise the resource's [events](/reference/events/), [webhooks](/reference/webhooks/) and [workflows](/reference/workflows/) as any other record's do, such as a workflow on `presences.wentOffline`. An offline report raises its event once.

Each change of a person's presence is also published on `people` as a `presence_changed` event, the same bytes to everyone who shares a channel with members with them, themselves included, as the members tables hold it at dispatch, read for the whole batch in one query:

```json
{ "user": "u1", "status": "offline", "at": "2026-11-21T10:00:00.000Z" }
```

A person who shares no channel is published to no one. The admin app shows it in the sidebar and on the members page (see [Pages](#pages)).

## Client events

A channel resource's `events` say what its signed-in members may send each other on its channels through the relay, such as a call ringing; the relay refuses any other event there with `event_not_allowed`, and a payload outside its schema or size, or sent more often than its rate, likewise. A conversation page with `typing` declares `typing` on its resource itself (see [Pages](#pages)). Each event takes:

| Key | |
| --- | --- |
| `schema` | The payload's JSON schema, draft 2020-12 unless it names another; it may load no other document. |
| `maxBytes` | The payload's largest size in bytes, 1 to 65536. |
| `perSecond`, `burst` | How often one person may send it a second, over all their sockets, and how many at once: positive, `burst` a whole number. |

An event's name is 1 to 64 bytes and none of `heartbeat`, `interest`, `presence`, `client_event` and `phx_*`, which the relay keeps for itself; the server refuses to start otherwise. The relay checks the schemas when it reads its apps file. Visitors send nothing. A page sends one with [`client.relay.send`](#from-code), and the others hear it with `from`, the channel and the time the relay stamps on it. <gap>The config cannot declare direct events, which `client.relay.direct` sends to a person, because declaring direct client events is not implemented, so the relay's apps file declares them by hand.</gap>

## Pages

With `realtime.relay`, the admin app follows the relay for someone signed in, on one socket per page, and `/meta` names the resources whose changes the relay notices:

- **Live updates:** the lists, records and counts of those resources are read again as the relay notices their changes, new, edited and deleted records alike, instead of through [`/api/live`](/reference/live/), which stays for the other `.live()` resources. While a [conversation page](/reference/ui-config/#conversation-pages) is open, only its own channel's notices read it again; the notices of other channels only move the [unread marks](/reference/sidebar/#typing-and-unread-from-the-relay). After the socket was down, everything shown is read again once.
- **Typing:** a conversation page with `typing` says who else types, above its box and in a thread's box, and tells the others while the reader types, as `typing` events on the record's relay channel. Without the relay, it goes over the record's own [channel](/reference/channels/) instead. A sidebar group with [`typing`](/reference/sidebar/#typing-and-unread-from-the-relay) says "typing…" beside a record someone types in, wherever the reader is.
- **Unread:** a sidebar group with [`unread`](/reference/sidebar/#typing-and-unread-from-the-relay) counts each conversation's unread messages once, then adds the relay's notices without reading.
- **Presence:** the page tells the relay the person is away while it is hidden and online once it shows; a page that shows again, or a device back online, connects again at once. With [presence](#presence), `/meta` names its resource and fields, never its key, and the sidebar's person marks, the members page and a conversation's members title show who is online, away or offline: the page reads the records of the people it shows, up to 100 in one request, those it shows later as they appear, everyone shown again after the socket was down, and applies each `presence_changed` as it comes, keeping a status only over one that began earlier. Someone whose record the reader's role may not read shows no presence, so grant `presences.read` to the people who see each other. An app's own [`presence` hook](/reference/status/#in-the-app) goes over it.

A conversation page with `typing` declares the event on its resource's channels: `protobase relay app` prints it in the apps file entry, and the relay `protobase dev` runs takes it too. A page sends `{ typing, thread }`, `thread` the key of the thread's first message or null, at most 256 bytes, 2 a second in bursts of 4. A `typing` the resource declares in its own `events` takes its place.

With the relay, a conversation page's `typing` needs its resource among `channels`: the server refuses to start otherwise.

A page joins a channel the person is added to while it is open, such as a new direct message, as it hears `joined`, and reads again what it shows once, so a sidebar group lists the conversation with who types and its unread count at once. <gap>An unread count also counts the reader's own messages sent from another device or tab, until they open the conversation, because notices do not name who made the change.</gap>

### From code

`client.relay` follows the relay from any page or app with `@protobase/client`:

```ts
const stop = client.relay.follow({
  onNotice: (notice) => {}, // { kind, resource, key, channel, mentions? }
  onEvent: (event) => {}, // { event, payload, from: { user, connection }, at, channel } or, direct, { ..., to }
  onResync: () => {}, // connected again after a drop: read again what is shown
  onStatus: (status) => {}, // 'connecting', 'open' or 'ended'
  onJoined: (channel) => {}, // joined a channel the person was added to: read again what is shown
})
await client.relay.send('conversations/7', 'typing', { typing: true })
await client.relay.direct('u2', 'ring', { call: 12 })
client.relay.view('conversations/7', ['thread:3'])
client.relay.presence('away')
```

| | |
| --- | --- |
| `follow(handlers)` | Hears every notice and event until the returned function is called. The first follower opens the socket and the last closes it. The socket connects with a fresh ticket each time, joins the relay's own topic and every channel the ticket lists, and each channel a `joined` event names, telling `onJoined` once it joined it, and connects again after a pause that grows with each failure, up to 30 seconds; an app that refuses a ticket with a client error, such as for a session that ended, ends it (`ended`). |
| `send(channel, event, payload)` | Sends a declared event to the channel's other sockets. Rejects with a `RelayRefusal` and the relay's reason, such as `rate_limited` or `event_not_allowed`, or `not_joined`. |
| `direct(to, event, payload)` | Sends a declared direct event to every device of a person who shares a channel with the sender. |
| `join(channel)` | Joins a channel the ticket did not list, such as one the person joined since, and again after each reconnect until the returned function is called. The socket stays in the channel until it next connects. |
| `view(channel, keys)` | Says which keys the page views in the channel, so the app's publishes about other keys pass it by; `undefined` views everything. |
| `presence(status)` | `away` or `online`, as the relay combines it over the person's devices. |
| `reconnect()` | Connects at once when the socket is down and waiting to try again. |
| `joined(channel)`, `status()` | Whether the socket joined a channel, and the connection's status. |
