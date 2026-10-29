---
title: Calls
description: Audio and video calls between an app's users, through a LiveKit server or straight between browsers, with Protobase deciding who is in a call, who may send and who hears whom.
---

## Turning them on

:::caution[In development]
Members join through a function of your own and the browser client. Call rows, a lobby, stage mode, recording, guests and the call UI are not built yet, and only Chrome has been tested.
:::

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

Or, with no media server, `backend: { kind: 'peer' }`, with `iceServers` for the STUN and TURN servers browsers reach each other through: `[{ urls: ['stun:stun.example.com:3478'] }]`.

Without `calls`, an app has none of it: the server loads no calls code, and only a page that imports `@protobase/client/calls` bundles the browser side.

Running LiveKit on your own machine: `bun run calls:up` in the Protobase repository starts one from `docker-compose.yml`, at `ws://127.0.0.1:7880` with the key `devkey` and the secret `secretsecretsecretsecretsecretsecret`.

## Admitting members

A member joins a call through an [API function](/guides/api-functions/) of your own, which decides whether the caller may join, then answers with `acceptWebSocket(await calls.join(member))`:

```ts
// functions/meeting.ts
import { defineFunction } from '@protobase/server'

export default defineFunction(async (request, { session, records, acceptWebSocket, calls }) => {
  const id = new URL(request.url).searchParams.get('call')!
  // The caller's access to the meeting record decides whether they may join; a refusal is a problem, as in any function.
  const meeting = await records.get('meetings', id)
  return acceptWebSocket(
    await calls.join({ call: id, member: String(session.user.id), publish: meeting.host === session.user.id ? true : ['microphone'] }),
  )
})
```

| | |
| --- | --- |
| `call` | The call: members with the same `call` meet. |
| `member` | Who joins, unique in the call, such as the user's id. LiveKit knows the member by nothing else: no name, no metadata. |
| `publish` | `true` to send any source, a list of `'camera'`, `'microphone'`, `'screen'` and `'screen-audio'`, or `false` to only listen. |
| `hears` | Optional: which of the others' tracks the member hears, as `(track) => boolean` of `{ member, kind, source }`; every track by default. |

The socket is checked again every minute like any function's: a caller who would now be refused is closed out of the socket and leaves the call. The function's own checks, such as access to the meeting, are repeated only when it passes them as `recheck`.

## Joining from the browser

`joinCall` from `@protobase/client/calls` opens the function's socket, with the browser's session cookie, and resolves once the member is in the call:

```ts
import { joinCall } from '@protobase/client/calls'

const call = await joinCall({
  url: `/api/functions/meeting?call=${id}`,
  onTracks: (tracks) => render(tracks), // [{ sid, member, kind, source, muted, track? }]
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

`onSpeakers` gets who speaks how loudly, and `onUnpublished` a source the media server stopped, such as after the member lost the right to send.

## Reconnecting

When the socket to Protobase closes, such as during a deploy, media keeps flowing and the browser opens a new socket that resumes the member from its own state. With LiveKit any process serving the app can take it; when LiveKit no longer knows the member, the browser joins again and sends the same tracks. After `maxRetries` tries in a row, 8 by default, the call is left.

## LiveKit

`kind: 'livekit'`. Protobase speaks LiveKit's signal protocol, version 17, on each member's behalf, over its single peer connection endpoint (`/rtc/v1`, LiveKit 1.9.1 and later), so media goes straight between the browser and LiveKit. Each member is a LiveKit participant of their own, which subscribes to nothing until Protobase lets them hear a track. LiveKit's data messages are not used: chat and reactions go over Protobase.

## Peer to peer

`kind: 'peer'`. Each member's browser keeps a peer connection to every other member's and sends them its media directly; Protobase passes their descriptions and candidates between them and tells each member who else is in the call and which tracks they hear. It suits small calls: a browser uploads its media once per other member. Members meet only on the same process, which keeps who is in each call, and a member whose socket was lost stays in the call for 30 seconds while their browser resumes. `hears` decides which tracks a member is told of; the media itself goes between the browsers, which Protobase cannot stop.

## Contract test

The repository's contract test runs members in Chromium through both plugins, against a real LiveKit server: `bun run calls:up`, then `bun run test:calls`. `LIVEKIT_IMAGE` in the environment of `calls:up` tries another LiveKit version.
