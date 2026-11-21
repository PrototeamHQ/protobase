---
title: Realtime relay
description: Hand the app's realtime connections to a relay, so the app and its database can sleep while people stay connected.
---

The app can hand its realtime connections to a relay, the open source [protobase-realtime](https://github.com/PrototeamHQ/protobase-realtime) server: the relay holds everyone's WebSocket, and the app talks to it only when something changes, so a quiet app and its database sleep while people stay connected. The relay keeps no data and never reads the app's database: the app tells it who is in which channel, what changed and for whom, and which sign-in sessions ended. It works beside the app's own [channels](/reference/channels/) and [live updates](/reference/live/), which stay as they are.

:::caution[In development]
The app's side is built: tickets, membership, change notices and session ends. <gap>Pages cannot connect to the relay from `@protobase/client` because its relay client is not implemented.</gap> <gap>The relay cannot report presence to the app because the app's presence endpoint is not implemented.</gap> <gap>Clients cannot send each other events such as typing through the relay because declaring client events per channel resource is not implemented.</gap>
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
        },
        rooms: {},
      },
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

The relay needs the app's own [sign-in](/reference/auth/), whose sessions its tickets name, with its store in the app's own database, as the `auth` config puts it: an auth store in another database is refused. A members resource's changes must be captured, so declare [`.live()`](/reference/live/) on it; the relay hears of the changes of every resource whose changes are captured, such as a live one, that is a channel resource or has a relation field to one. [`protobase migration`](/reference/cli/#migration) writes the trigger that ends a deleted session's sockets, in the `relay` schema, and the server checks it at start.

[`protobase relay app`](/reference/cli/#relay-app) prints the app's entry for the relay's apps file, from this config and the app's `url`.

## Local development

[`protobase dev`](/reference/cli/#dev) runs a relay of its own when `realtime.relay` has no `url`, such as with `RELAY_URL` unset in `.env`, so local realtime needs no second command. Add the relay's npm package to the project once:

```sh
npm install --save-dev @protobase/realtime
```

<gap>`protobase dev` cannot run the relay without the project installing `@protobase/realtime` because the CLI does not depend on it until the package is published.</gap>

It starts the relay on the first load of a config with `realtime.relay`, an edit that adds it included, on a free port of `127.0.0.1`, serving this one app with the dev server's origin, and gives the app its address. The keys are the config's when it sets them, and otherwise made anew for each `protobase dev`. An edit that changes the app's id or keys starts it again, one that removes `realtime.relay` or sets a `url` stops it, and it stops with `dev`. Its own messages, such as an apps file it refuses, show in the terminal. With a `url`, the app uses that relay and `dev` starts none.

## Tickets

A client connects to the relay with a ticket from `POST /api/relay/ticket`, with `{ "channels": [...] }`, optional, as JSON. The answer is `{ ticket, url, expiresAt }`: the relay's socket address and a ticket that connects once, within a minute. Every connection, a reconnect too, takes a new ticket.

- **Signed in:** the ticket names the person and the sign-in session they called with, so a device that connects makes no new session, and lists every channel they are a member of, as the members resources hold it. A caller without a session of the app, such as an API key or an outside app acting for the user, is refused with `403`; a session that ended with `401`.
- **Visitors:** with an `anonymous` role, a caller without a token gets a ticket of an anonymous session of its own, which receives and never sends.
- **Open channels:** both list the channels they ask for in `channels` of resources without `members` whose records are public: the `anonymous` role may read them, as `GET /api/v1/<resource>/<key>` decides it for a visitor. Someone's own access to a record never makes its channel open, so no one's access to one can end while their socket stays open. A channel there is none of, one whose record is not public and one of a resource with members are refused alike with `404`; a record only some people may read takes `members`. A ticket lists at most 200 channels (`400`, or `422` when the memberships are more).

## Notices

The [dispatch](/reference/events/) that turns each transaction's changes into events also hands them to the relay: in its own transaction it reads each change's audience once, from the members tables, and queues one `relay.send` job with the commands for the batch. A record of a channel resource is noticed on its own channel, and a record of a resource with a relation to one on the channel it points at, both where it was and where it moved. Each notice is one `change` event to the channel, the same bytes to every socket it reaches:

```json
{ "kind": "create", "resource": "messages", "key": "42", "channel": "conversations/7", "mentions": ["u2"] }
```

`kind` is `create`, `update`, `delete` or `undelete`; `mentions` is there with `mentions` set. A notice tells clients what changed, so they read only the records they show. On a channel with members it reaches its members as the database holds them at dispatch, and a person who joined or left with that change; on an open channel, everyone joined to it, while the anonymous role reads its record as it stands at dispatch. The relay sends a notice once, however often the job sends it again.

A members record that is created or undeleted adds its person to the channel on the sockets they have open, before its notice, and one that is deleted or soft-deleted takes them out after it: they can join, or are closed out, without connecting again. Commands go in commit order, one job at a time; while the relay is down, they wait and try again, once a minute at most. A command the relay refuses, such as one over its size limit, goes to the app's error reporter and is passed over.

Once an open channel's record stops being public, its notices stop, and a new ticket refuses it. <gap>Sockets that joined an open channel stay joined after its record stops being public, hearing nothing of it, until they reconnect, because closing a channel on every socket is not implemented.</gap>

## Sessions

When a sign-in session ends, its sockets close: a trigger on the sessions table queues a `relay.close-sessions` job in the deleting transaction, for a sign-out, a revoke, a ban, a newer sign-in in the same browser or a delete in SQL alike, and the job tells the relay to close them. A ticket also queues a `relay.session-expiry` job for its session's expiry, once for each session: it closes the session's sockets once the session expired, and waits for the new expiry of one that was extended meanwhile. The person's other sessions stay connected. The relay itself keeps no timers.
