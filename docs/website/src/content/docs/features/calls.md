---
title: Calls
description: Audio and video calls between an app's users, through LiveKit or peer to peer, with Protobase deciding who is in a call and who hears whom.
---

- [Calls](/reference/calls/) (beta): Voice and video calls on any record, with screen sharing, a ready-made call view and ringing on any open page, and guest links that let someone from outside join one call.
- [LiveKit](/reference/calls/#livekit) (in development): The media goes through a LiveKit server, self-hosted or LiveKit Cloud, which Protobase speaks to for each member.
- [Peer to peer](/reference/calls/#peer-to-peer) (in development): With no media server, the members' browsers send their media straight to each other, for small calls.
- [Admitting members](/reference/calls/#admitting-members) (in development): A function of your own admits the caller to a call with what they may send and whose tracks they hear.
- [Joining from the browser](/reference/calls/#joining-from-the-browser) (in development): `joinCall` from `@protobase/client/calls` sends the camera, microphone and screen in plain WebRTC, with no media library in the app.
- [Reconnecting](/reference/calls/#reconnecting) (in development): A call keeps its media through a deploy or a dropped connection, and resumes on any process serving the app.
