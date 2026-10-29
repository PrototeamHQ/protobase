---
title: Calls
description: Audio and video calls on any record of an app, through a LiveKit server or straight between browsers, with Protobase deciding who is in a call, who may send and who hears whom.
---

:::caution[Beta]
Calls live on records, with who is in them, removal and their end. A lobby, stage mode, recording, guests and the call UI are not built yet, and calls have been tested in Chromium and Firefox only.
:::

## Turning them on

Calls carry audio and video between an app's users. The browser runs plain WebRTC and talks only to Protobase, which relays its offers, answers and candidates to the call's media plugin, inside the Protobase server: [LiveKit](#livekit), whose server carries the media, or [peer to peer](#peer-to-peer), where the browsers send it to each other. Either way the media never passes through Protobase, which decides who is in a call, who may send and who hears whom, and apps load no media library.

```ts
// protobase.config.ts
import { defineConfig } from '@protobase/config'

export default defineConfig(({ env }) => ({
  calls: {
    backend: { kind: 'livekit', url: env.LIVEKIT_URL!, apiKey: env.LIVEKIT_API_KEY!, apiSecret: env.LIVEKIT_API_SECRET! },
  },
}))
```

- `url`: the LiveKit server, self-hosted or LiveKit Cloud, such as `wss://livekit.example.com`.
- `apiKey`, `apiSecret`: the key Protobase signs each member's LiveKit token with.

Or, with no media server, `backend: { kind: 'peer' }`: see [Peer to peer](#peer-to-peer) for its `iceServers` and `maxMembers`.

- `maxMinutes`: how long a call lasts at most, 240 by default. Then it ends, whoever is still in it.
- `processes`: `'many'` when several processes serve the app behind one address, so members that different processes serve meet in one call; `'one'`, the default, otherwise.

Without `calls`, an app has none of it: the server loads no calls code, and only a page that imports `@protobase/client/calls` bundles the browser side. With `calls`, [`protobase migration`](/reference/cli/#migration) adds the `calls` schema, where calls and their members are kept; apply it with the project's other migrations. `protobase dev` and `protobase serve` do not start while it is missing.

Running LiveKit on your own machine: `bun run calls:up` in the Protobase repository starts one from `docker-compose.yml`, at `ws://127.0.0.1:7880` with the key `devkey` and the secret `secretsecretsecretsecretsecretsecret`.

## Calls on records

A call belongs to a record, such as a conversation or a meeting, and the record's readers see it live: who is in it, when it started and when it ended. You can remove someone from a call, a call ends by itself once everyone has left, and a peer-to-peer call has a size limit.

A record has at most one call going on: the first member to join starts it, and everyone who joins the record's call after meets them in it. Who started it, when, who joined and who was removed stay on the record once it ended, as its history.

### Admitting members

A member joins the call on a record through an [API function](/guides/api-functions/) of your own, which decides whether the caller may join, then answers with `acceptWebSocket(await calls.join(member))`:

```ts
// functions/meeting.ts
import { defineFunction } from '@protobase/server'

export default defineFunction(async (request, { session, records, acceptWebSocket, calls }) => {
  const id = new URL(request.url).searchParams.get('meeting')!
  const { record: meeting } = await records.get('meetings', id)
  return acceptWebSocket(
    await calls.join({
      record: { resource: 'meetings', key: id },
      member: String(session.user.id),
      publish: meeting.host_id === session.user.id ? true : ['microphone'],
    }),
  )
})
```

| | |
| --- | --- |
| `record` | The record the call is on, `{ resource, key }`. Only a signed-in caller who can read it joins: a visitor without an account is refused with 403, and one who cannot read it with the API's 404. |
| `member` | Who joins, unique in the call. Take it from the signed-in caller, such as `session.user.id`, never from the request: the other members know them by it. LiveKit knows the member by nothing else: no name, no metadata. |
| `publish` | `true` to send any source, a list of `'camera'`, `'microphone'`, `'screen'` and `'screen-audio'`, or `false` to only listen. |
| `hears` | Optional: which of the others' tracks the member hears, as `(track) => boolean` of `{ member, kind, source }`; every track by default. |
| `recheck` | Optional: the function's own checks, such as whether the caller is still invited, repeated every minute. Throw a 401, 403 or 404 problem to take the member out. |

The socket is checked again every minute, like any function's, and so is the caller's read of the record, then `recheck`: a member who can no longer read the record, or whom `recheck` refuses, is out of the call within the minute, and so is one whose check fails or takes longer than a minute. Pass your own check as `recheck` to `calls.join`, not on the events it returns, which would replace the record's check. A member who joins the same call again, from another tab, takes the place of their first socket.

### Who is in it

Each member's browser gets everyone in the call, themselves too, members who send nothing included, whenever that changes: `onMembers` of `joinCall`, and `call.members()`, as `[{ member, joined_at }]`. A change made on the process that serves a member reaches them at once; one made on another process, within a second.

The record's readers get its calls, each with who is in it now, at `GET /api/{resource}/{key}:calls`, the one going on first, then the newest, 20 at most:

```json
{ "items": [{ "id": "4b1f…", "started_by": "ann", "started_at": "2026-10-29T10:00:00.000Z", "ended_at": null, "members": [{ "member": "ann", "joined_at": "2026-10-29T10:00:00.000Z" }], "removed": [] }] }
```

With `?watch=true` the same comes as a `text/event-stream`, each event's data `{ items }`, at once and whenever the calls change; the stream ends once its user can no longer read the record, at the next minute's check. Who reads a record reads its calls: the same operation, tenant, row filter and record-level rule as a get, and a record the caller cannot read is a 404 whether or not it has a call. A visitor without an account is refused. `client.calls(resource, key)` and `client.watchCalls(resource, key, { onCalls })` of `@protobase/client` read and follow them, and `calls.of({ resource, key })` in a function gives them to your own code, with no access check, like `db`. Readers see who is in a call, never the members' signaling or network addresses. <gap>A list cannot show its records' calls live because a stream of several records' calls is not implemented.</gap>

### Removing someone

`calls.remove(call, member)` in a function takes the member out of the call at once, the call's `id` as `joinCall`'s `call.id` and the record's calls give it. Their sockets close, with `removed` as the reason `onState` gets, the others' browsers close their connections to them, and the call keeps the removal: the member's resume and every join of theirs to that call are refused, also one already on its way. It returns whether they were in the call; a removal from a call that ended, or of someone in another call, changes nothing. Who may remove whom is your function's to decide.

### The end of a call

A call ends when its last member left. A member whose socket was lost stays in the call for 30 seconds while their browser resumes, so a call whose members all lost their connection, or whose server process stopped, ends 30 seconds later. A call also ends at `maxMinutes`, whoever is still in it: the server closes every member out. A call that ended stays ended: a resume of it is refused, and the next join starts a new call on the record.

### Size

A peer-to-peer call admits `maxMembers` at most, 8 by default. One more is refused with the reason `full`, which `onState` gets as `{ state: 'left', reason: 'full' }`, for the app to say "This call is full". A member who joins the call again from another tab is no one more.

## Joining from the browser

`joinCall` from `@protobase/client/calls` opens the function's socket, with the browser's session cookie, and resolves once the member is in the call:

```ts
import { joinCall } from '@protobase/client/calls'

const call = await joinCall({
  url: `/api/functions/meeting?meeting=${id}`,
  onTracks: (tracks) => render(tracks), // [{ sid, member, kind, source, muted, track? }]
  onMembers: (members) => showMembers(members), // [{ member, joined_at }]
  onState: (state) => showState(state), // connecting, joined, resuming, or left with its reason
})
const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
await call.publish({ camera: media.getVideoTracks()[0], microphone: media.getAudioTracks()[0] }, { simulcast: true })
```

| | |
| --- | --- |
| `publish(tracks, { simulcast })` | Sends tracks under their sources; rejects when the member may not. With `simulcast` and LiveKit, video goes in three sizes. |
| `unpublish(source)` | Stops sending the source; the track itself goes on until the page stops it. |
| `mute(source, muted)` | Mutes or unmutes a sent track; the others see `muted` on it. |
| `view(sids, { width, height })` | With LiveKit: how large the page shows remote video, so it receives the size that fits; `'hidden'` receives none. |
| `restartIce()` | New network paths, such as after a network change; a failed connection restarts by itself. |
| `leave()` | Leaves the call. |

`call.id` is the call, as the record's calls list it and `calls.remove` takes it. `onSpeakers` gets who speaks how loudly, and `onUnpublished` a source the media server stopped, such as after the member lost the right to send.

A call that is left rejects the join, or ends a joined call, with its reason in `onState`: `ended`, `removed` (by `calls.remove`, or by a check that refused the member), `full`, `refused` (the function refused the caller), or `unavailable`, when the server failed to take the member in `maxRetries` times in a row.

## Reconnecting

When the socket to Protobase closes, such as during a deploy, media keeps flowing and the browser opens a new socket that resumes the member from its own state, through the function again, so a member who can no longer read the record, or was removed, is refused. Any process serving the app can take it; when LiveKit no longer knows the member, the browser joins again and sends the same tracks. After `maxRetries` tries in a row, 8 by default, the call is left.

## LiveKit

`kind: 'livekit'`. Protobase speaks LiveKit's signal protocol, version 17, on each member's behalf, over its single peer connection endpoint (`/rtc/v1`, LiveKit 1.9.1 and later), so media goes straight between the browser and LiveKit. Each member is a LiveKit participant of their own, which subscribes to nothing until Protobase lets them hear a track. LiveKit's data messages are not used: chat and reactions go over Protobase.

## Peer to peer

`kind: 'peer'`. Each member's browser keeps a peer connection to every other member's and sends them its media directly; Protobase passes their descriptions and candidates between the members of the same call only, and tells each member who else is in the call and which tracks they hear. `hears` decides which tracks a member is told of; the media itself goes between the browsers, which Protobase cannot stop.

A peer-to-peer call holds a small group only: a browser uploads its media once per other member, so `maxMembers`, 8 by default, bounds it. Members of a peer-to-peer call can see each other's network addresses, as their browsers connect to each other; readers of the record who are not in the call cannot.

With `calls: { processes: 'many' }`, members that different processes serve meet in one call: a description or candidate for a member another process serves goes through the `calls` schema, which each process with a member in a call reads ten times a second.

```ts
calls: {
  backend: { kind: 'peer', maxMembers: 8, iceServers: [{ urls: ['stun:stun.example.com:3478'] }] },
}
```

- `iceServers`: the STUN and TURN servers the browsers find a path to each other through, which every member's browser gets; Protobase has none by default, and the browser never chooses its own. Without a STUN server, only browsers on the same network connect: set one so that people behind ordinary home routers do.
- A direct connection can fail behind some strict networks, such as a company firewall that lets no UDP through, and the members then hear nothing of each other. Protobase relays no media: add a TURN server of your own to `iceServers` for them, with short-lived credentials, since every member's browser receives them.

## Contract test

The repository's contract test runs members in Chromium and Firefox through both plugins, against a real LiveKit server and a Postgres test database: `bun run test:db` and `bun run calls:up`, then `bun run test:calls`. `LIVEKIT_IMAGE` in the environment of `calls:up` tries another LiveKit version.
