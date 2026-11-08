---
title: Notifications
description: A bell in the top bar and push to browsers and phones, for what your app tells its users.
---

- [Notifications](/reference/notifications/#turning-them-on) (beta): `notifications: {}` in the config gives every signed-in user a bell in the top bar and push to their browsers and phones; `ui: false` keeps only the backend.
- [Devices](/reference/notifications/#devices) (beta): Each signed-in user registers their own browsers and phones to receive push, and a device gets it only while the sign-in it was registered in lasts.
- [Your own parts](/reference/notifications/#your-own-parts) (beta): Senders, the device store, the history store and the bell can each be replaced by your own, such as a store outside the database.
- [Table names](/reference/notifications/#table-names) (beta): The built-in stores' schema, tables and columns can be renamed, as auth's users table can.
- [Sending notifications](/reference/notifications/#sending) (beta): Your code sends a notification to users or to devices as a background job, queued in the same transaction as a write, and says on each one whether it shows in the inbox.
- [Notification history](/reference/notifications/#history) (beta): Each user's inbox notifications are kept with when they were read, and the API lists them, counts the unread ones and marks them read.
- [Web Push](/reference/notifications/#web-push) (beta): Notifications reach desktop and Android browsers and home-screen web apps on iPhone through Web Push, with keys you generate.
- [Push on Android](/reference/notifications/#android) (beta): The server sends notifications to Android devices through Firebase Cloud Messaging with the service account key in `PROTOBASE_FCM_SERVICE_ACCOUNT`, and the mobile app receives them, set up by `protobase mobile` from a `google-services.json` in the project.
- [Push on iOS](/reference/notifications/#ios) (in development): The server sends notifications to iPhone and iPad through the Apple Push Notification service with the APNs key in `PROTOBASE_APNS_KEY`, `PROTOBASE_APNS_KEY_ID` and `PROTOBASE_APNS_TEAM_ID`; the mobile app registering for them and receiving them on iOS is coming soon.
- [Push relay](/reference/notifications/#push-relay) (beta): Send push notifications through a relay that holds the mobile app's push keys, so your app needs only its own relay credential.
- [Do not disturb](/reference/status/#do-not-disturb) (beta): While someone is on do not disturb, sends push nothing to their devices and keep inbox notifications in the bell for later.
- [Notification bell](/reference/notifications/#the-bell) (beta): The top bar shows how many inbox notifications are unread; its panel opens each one, marks them read and turns push on or off for this device.
