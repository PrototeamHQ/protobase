---
title: History, comments and live updates
description: The changes of each record, comments on it, and pages that refresh as records change.
---

- [Record history](/reference/history/#on-the-record-page): Every change to a record is kept with who made it and when, including changes made outside the API.
- [Ignored fields](/reference/history/#ignoring-fields): Fields the database keeps up to date itself, such as counts, can be left out of a record's history, so their changes add no entries.
- [Activity](/reference/history/#activity): Admins see all changes across resources in one list.
- [History retention](/reference/history/#keeping-it): Changes older than a set number of days are removed by a daily job.
- [Comments](/reference/comments/#on-the-record-page): Anyone who can read a record can read and add comments on it.
- [Comment formatting](/reference/comments/#formatting): Comments show bold, italic, strikethrough, code, code blocks, lists and quotes, and web addresses become links that open in a new tab.
- [Mentions](/reference/comments/#mentions): Mentioning a colleague in a comment sends them an email with a link to the record.
- [Comment moderation](/reference/comments/#moderation): Admins find and delete comments across the app.
- [Live updates](/reference/live/#what-a-page-hears): Open lists and record pages refresh within seconds when a record changes, including changes made outside the API.
- [Live views](/reference/live/#resources-backed-by-a-view) (experimental): A resource backed by a view updates live when the tables it reads change.
- [Change stream](/reference/live/#the-stream): Apps follow record changes over a stream that catches up after a reconnect.
- [Polling, then a socket](/reference/live/#polling-then-a-socket): Apps and Node scripts poll for changes first and switch to a WebSocket after 30 seconds, or at once, falling back to polling while the socket is down.
- [Presence](/reference/channels/#presence) (beta): Apps see who else has a record open and what each of them tracks, such as online or away, for whoever may read the record.
- [Realtime relay](/reference/realtime-relay/) (in development): Apps hand their realtime connections to a relay, so they and their database can sleep while people stay connected: the app issues connect tickets for signed-in people and visitors, keeps the relay's channel members in step with its members records, tells each channel's members of every change, and closes a session's sockets when it signs out or expires. `protobase dev` runs a relay for the app by itself.
- Relay presence (coming soon): The relay reports who comes online, goes away and goes offline, and the app records it, raises its events and tells the right people.
- Relay client events (coming soon): Clients send each other events such as typing through the relay, as each channel resource declares them, with a schema, a size and a rate.
- [Broadcasts](/reference/channels/#broadcasts) (beta): Apps on a record send each other short-lived events, such as typing, which are never stored, as JSON or as bytes, such as a chunk of audio or a drawing stroke; the app's own code sends them too, from an API function, over HTTP or [from SQL](/reference/channels/#from-sql) with `channels.send()`.
