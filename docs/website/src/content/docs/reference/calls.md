---
title: Calls
description: Audio and video calls on any record of an app, through a LiveKit server or straight between browsers, with Protobase deciding who is in a call, who may send and who hears whom.
---

:::caution[Beta]
Calls live on records, with who is in them, removal and their end, a ready-made call view, ringing and guest links. The view is made for small peer-to-peer calls, and there are no host controls yet. Stage mode and recording are not built yet, and calls have been tested in Chromium and Firefox only.
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
| `name` | Optional: the name the others in the call see, such as the user's name. [Guests](#guests) see members by it alone. |
| `invites` | Optional: `true` lets the member share [guest links](#guests) to the call and let its guests in; `false` by default. |

The socket is checked again every minute, like any function's, and so is the caller's read of the record, then `recheck`: a member who can no longer read the record, or whom `recheck` refuses, is out of the call within the minute, and so is one whose check fails or takes longer than a minute. Pass your own check as `recheck` to `calls.join`, not on the events it returns, which would replace the record's check. A member who joins the same call again, from another tab, takes the place of their first socket.

### Who is in it

Each member's browser gets everyone in the call, themselves too, members who send nothing included, whenever that changes: `onMembers` of `joinCall`, and `call.members()`, as `[{ member, joined_at, name? }]`, with `name` for a member your function named and for every guest. A change made on the process that serves a member reaches them at once; one made on another process, within a second.

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

## Call view and ringing

`@protobase/ui` draws a call for you: put a call view beside your own content, show a record's call with Join, and ring the people you name wherever they are in the app. A missed call stays in the bell.

### The call view

`RecordCall` shows the record's call while the page joins it, and nothing otherwise, so you place it beside the record's own content, such as a conversation's messages on a [full-area record page](/reference/custom-components/#full-area-record-pages). `url` is your function's socket, as `joinCall` takes it:

```tsx
import { CallMark, RecordCall, useMembers } from '@protobase/ui'

export const Conversation = ({ id }: { id: string }) => {
  const { member } = useMembers()
  return (
    <div className="flex h-full">
      <Messages conversation={id} />
      <RecordCall resource="conversations" recordKey={id} url={`/api/functions/call?conversation=${id}`} nameOf={(user) => member(user)?.name ?? user} className="w-1/2" />
    </div>
  )
}
```

The view checks the microphone and camera first, with a preview of the camera, and joins after Join. In the call, everyone shows at the same size, the one speaking ringed, or a screen share large with the people beside it, or under it on a phone. Its controls turn the microphone, the camera and a screen share on and off, the share with the tab's sound where the browser offers it, and Leave goes back to the record. Each person's tile marks a muted microphone and a poor connection, and says when the browser cannot connect to them; the view says Reconnecting while its link to the server is restored, and says in plain words when the call is full, when a microphone or camera is blocked, or when the call ended. It fills its parent, at a desktop's width or a phone's.

| | |
| --- | --- |
| `resource`, `recordKey` | The record whose call it is. |
| `url` | Your function's socket, which admits the member. |
| `nameOf` | A person's name by the member your function admits them as, such as a user id; the member itself by default. |

`CallView` is the view on its own, with `leave`, where Leave goes, in place of the record: for a call you place without the record's address.

### A record's call

`CallMark` shows a record's call where you put it, such as a conversation's header: Start call while there is none, and "Call in progress · 3 · Join" while one goes on, live. Start call and Join open the record's page joining its call, `/{resource}/{key}?call=join`, which shows `RecordCall`.

```tsx
<CallMark resource="conversations" recordKey={id} />
```

The mark follows the record's calls over its [record channel](/reference/channels/), on the one socket a page shares for all its channels, so a page that holds a channel already, such as for typing, opens no other connection for it. `useRecordCalls(resource, key)` gives you the same calls, live, for a mark of your own.

### Ringing

Name the people a call rings in `calls.join`'s `ring`: when that join starts the record's call, each of them is rung on whatever page of the app they have open, with Accept and Decline, and a ring tone once the page may play sound.

```ts
return acceptWebSocket(
  await calls.join({
    record: { resource: 'conversations', key: id },
    member: String(session.user.id),
    publish: true,
    ring: { users: conversation.member_ids, title: `Call in ${conversation.title}` },
  }),
)
```

| | |
| --- | --- |
| `users` | The user ids rung, 50 at most; the caller is never rung. |
| `title`, `body` | What the ring and the bell say. |
| `url` | Where the bell's entry leads, an absolute URL; the record's page by default. |

A ring lasts 30 seconds. Accept opens the record's page joining the call, on that device only, after the click; joining the call from any device stops the ring on every page of that person, and so do Decline and the end of the call. The ring reaches open pages over the app's [live stream](/reference/live/), which every page of an app with a live resource already holds, so it opens no connection of its own; in an app without one, each page opens that one stream for its rings.

With [notifications](/reference/notifications/), each person rung also gets the call in their bell, where a missed call stays, and as a push on their devices, which reaches a closed app. With [status](/reference/status/), someone on do not disturb is not rung on any page or device; the call waits in their bell. Busy rings as usual.

`client.rings.list()` and `client.rings.decline(call)` of `@protobase/client` read and decline the calls ringing the signed-in user, for a ring of your own.

## Guests

Share a link to one call with someone from outside, such as a candidate for a job interview: the guest gives a name, checks their microphone and camera, and waits in a lobby until someone in the call admits them. A guest has no account and reaches nothing but that call: not the record, its chat, its readers' list of calls, or anything else in the app.

### Sharing a link

A member your function joins with `invites: true` gets Guests in the call view: a link to share, with what its guests may send (camera, microphone and screen; camera and microphone; or microphone only, never more than the member may send themselves), the links that are live, with Revoke, and who waits in the lobby, with Let in and Turn away. Someone who waits also shows above the call, to let in without opening Guests.

```ts
// The name the others see, from the app's own records of its people.
const { record: me } = await records.get('people', String(session.user.id))
return acceptWebSocket(
  await calls.join({
    record: { resource: 'interviews', key: id },
    member: String(session.user.id),
    name: String(me.name),
    publish: true,
    invites: true,
  }),
)
```

A link opens `/-/call-guest` with its token after `#`, which the browser sends to no server. It lets guests in until the call ends, or for an hour when made so, or until the time `call.guests.link({ publish, expiresAt })` gives it, unless a member revokes it first. At most 10 wait on a link at once, and once its members turned away 3 guests, it lets nobody else wait: make a new link.

### What a guest gets

The page a link opens asks the guest's name, then shows the call view's check of their microphone and camera, with Ask to join, then "Waiting for someone in the call to let you in" until a member lets them in or turns them away. Once in, the guest is `guest:<id>` in the call, shown by the name they gave with "(guest)", and sends only what their link allows. They see the members by the `name` your function gave, or as "Someone in the call".

The guest's token opens their lobby wait and the guest call socket, and nothing else: no other route takes it, it is no session, and no cookie is set. Members' functions never take a member of the form `guest:…`.

### Taking a guest out

Revoking a link takes its guests out of the call, and Remove in Guests, or `calls.remove(call, 'guest:<id>')` in a function, takes out one. Their sockets close, and their joins and resumes are refused. Every guest's socket is checked again every minute too, and is closed once their link is revoked or past its time, they were removed, or guest links were turned off.

A call left with only guests in it ends 2 minutes after the last member left, and the guests see "The call ended". A member who comes back before then keeps it going.

### Organizations

In an app with [organizations](/reference/auth/#organizations), a link is for the organization of the call's record, and the organization's owner or an admin can turn guest links off on the organization's page, or with `PUT /api/calls/guests/organization` and `{ "allowed": false }`. That revokes every live link of its calls and takes their guests out at once, and no member can make a new link until it is on again. A call on a record of a resource without a tenant gets no guest links in an app with organizations, since no organization's switch could stop them.

### Safety

The lobby is rate limited like the sign-in routes, by the address the sign-in routes use: 5 lobby entries a minute per address, and an address that sends 10 unknown or refused tokens in a minute is refused for the rest of that minute. <gap>The lobby's limits cannot hold across several processes because they are counted in each process's memory, as the sign-in routes' are.</gap>

In a peer-to-peer call, a guest and the members can see each other's network addresses, as their browsers connect to each other. A guest who waits, or was turned away, gets nothing of the call: no members, no tracks and no addresses. Protobase refuses what a guest may not send, but in a peer-to-peer call the media goes between the browsers, so a guest's browser that was changed to send more is only held back by the members' own browsers.

With `calls`, [`protobase migration`](/reference/cli/#migration) adds the guests' tables to the `calls` schema, a calls schema made before them too.

### From your own page

`guestLobby` from `@protobase/client/calls` is the guest's side, for a page of your own: `enter(link, name)` gives the guest's token, `wait(token)` says `waiting`, `admitted`, `denied` or `ended`, asked about once a second, and `leave(token)` leaves the lobby. Once admitted, `joinCall({ url: lobby.socketUrl, guest: token })` joins the call. A member's `call.guests` has `link({ publish, expiresAt })`, which resolves with the link and its token once, `revoke(link)`, `admit(guest)`, `deny(guest)` and `remove(guest)`, each rejecting with `GuestRefused` and its reason when the server did not; `onLobby` of `joinCall` gets who waits and the live links.

## Reconnecting

When the socket to Protobase closes, such as during a deploy, media keeps flowing and the browser opens a new socket that resumes the member from its own state, through the function again, so a member who can no longer read the record, or was removed, is refused. Any process serving the app can take it; when LiveKit no longer knows the member, the browser joins again and sends the same tracks. After `maxRetries` tries in a row, 8 by default, the call is left.

## LiveKit

`kind: 'livekit'`. Protobase speaks LiveKit's signal protocol, version 17, on each member's behalf, over its single peer connection endpoint (`/rtc/v1`, LiveKit 1.9.1 and later), so media goes straight between the browser and LiveKit. Each member is a LiveKit participant of their own, which subscribes to nothing until Protobase lets them hear a track. LiveKit's data messages are not used: chat and reactions go over Protobase.

## Peer to peer

`kind: 'peer'`. Each member's browser keeps a peer connection to every other member's and sends them its media directly; Protobase passes their descriptions and candidates between the members of the same call only, and tells each member who else is in the call and which tracks they hear. `hears` decides which tracks a member is told of; the media itself goes between the browsers, which Protobase cannot stop.

A peer-to-peer call holds a small group only: a browser uploads its media once per other member, so `maxMembers`, 8 by default, bounds it. Members of a peer-to-peer call, and its [guests](#guests), can see each other's network addresses, as their browsers connect to each other; readers of the record who are not in the call cannot.

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
