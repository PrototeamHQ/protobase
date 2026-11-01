---
title: History, comments and live updates
description: The changes of each record, comments on it, and pages that refresh as records change.
---

- [Record history](/reference/history/#on-the-record-page): Every change to a record is kept with who made it and when, including changes made outside the API.
- [Activity](/reference/history/#activity): Admins see all changes across resources in one list.
- [History retention](/reference/history/#keeping-it): Changes older than a set number of days are removed by a daily job.
- [Comments](/reference/comments/#on-the-record-page): Anyone who can read a record can read and add comments on it.
- [Mentions](/reference/comments/#mentions): Mentioning a colleague in a comment sends them an email with a link to the record.
- [Comment moderation](/reference/comments/#moderation): Admins find and delete comments across the app.
- [Live updates](/reference/live/#what-a-page-hears): Open lists and record pages refresh within seconds when a record changes, including changes made outside the API.
- [Change stream](/reference/live/#the-stream): Apps follow record changes over a stream that catches up after a reconnect.
- [Polling, then a socket](/reference/live/#polling-then-a-socket): Apps and Node scripts poll for changes first and switch to a WebSocket after 30 seconds, or at once, falling back to polling while the socket is down.
- [Presence](/reference/channels/#presence) (beta): Apps see who else has a record open and what each of them tracks, such as online or away, for whoever may read the record.
- [Broadcasts](/reference/channels/#broadcasts) (beta): Apps on a record send each other short-lived events, such as typing, which are never stored, as JSON or as bytes, such as a chunk of audio or a drawing stroke; the app's own code sends them too, from an API function, over HTTP or [from SQL](/reference/channels/#from-sql) with `channels.send()`.
