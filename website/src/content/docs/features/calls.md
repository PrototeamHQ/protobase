---
title: Calls
description: Audio and video calls between an app's users, through LiveKit or peer to peer, with Protobase deciding who is in a call and who hears whom.
---

- [Calls](/reference/calls/#turning-them-on) (in development): `calls: { backend }` in the config carries calls' audio and video through a media plugin inside the server, and an app without it loads none of it.
- [LiveKit](/reference/calls/#livekit) (in development): The media goes through a LiveKit server, self-hosted or LiveKit Cloud, which Protobase speaks to for each member.
- [Peer to peer](/reference/calls/#peer-to-peer) (in development): With no media server, the members' browsers send their media straight to each other, for small calls.
- [Admitting members](/reference/calls/#admitting-members) (in development): A function of your own admits the caller to a call with what they may send and whose tracks they hear.
- [Joining from the browser](/reference/calls/#joining-from-the-browser) (in development): `joinCall` from `@protobase/client/calls` sends the camera, microphone and screen in plain WebRTC, with no media library in the app.
- [Reconnecting](/reference/calls/#reconnecting) (in development): A call keeps its media through a deploy or a dropped connection, and resumes on any process serving the app.
