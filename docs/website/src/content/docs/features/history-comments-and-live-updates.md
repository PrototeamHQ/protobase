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
- [Realtime relay](/reference/realtime-relay/) (in development): Apps hand their realtime connections to a relay, so they and their database can sleep while people stay connected: the app issues connect tickets for signed-in people and visitors, keeps the relay's channel members in step with its members records, tells each channel's members of every change, and closes a session's sockets when it signs out or expires. `protobase dev` runs a relay for the app by itself. An app on a platform that runs the relay, Protobase Realtime, picks up its address and keys from PROTOBASE_REALTIME_URL, PROTOBASE_REALTIME_APP, PROTOBASE_REALTIME_API_KEY, PROTOBASE_REALTIME_TICKET_KEY and PROTOBASE_REALTIME_PRESENCE_KEY; a value in the config wins. `protobase build` writes the app's events and presence for the relay's apps file into the bundle's manifest, and the platform's PROTOBASE_REALTIME_ENABLED switch, true or false, says when it moves the app.
- [Relay presence](/reference/realtime-relay/#presence) (in development): The relay reports who comes online, goes away and goes offline; the app keeps it in a resource of its own, raises that resource's events, so workflows can act when someone goes offline, and tells the people who share a conversation with them, whose sidebar and members page show them online, away or offline.
- [Relay in pages](/reference/realtime-relay/#pages) (in development): Pages follow the relay on one socket: open views stay current from its notices and read again once after a reconnect, conversations show who types, sidebar groups say "typing…" and count unread messages without reading per message, also of a conversation the person was just added to, all by configuration; `client.relay` gives the same from code.
- [Relay client events](/reference/realtime-relay/#client-events) (in development): Each channel resource declares in the config the events its clients may send each other, such as typing, with a schema, a size and a rate.
- [Broadcasts](/reference/channels/#broadcasts) (beta): Apps on a record send each other short-lived events, such as typing, which are never stored, as JSON or as bytes, such as a chunk of audio or a drawing stroke; the app's own code sends them too, from an API function, over HTTP or [from SQL](/reference/channels/#from-sql) with `channels.send()`.
