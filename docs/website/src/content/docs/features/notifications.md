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
- Push on Android (coming soon): Notifications reach the Android build of the app on a user's phones.
- Push on iOS (coming soon): Notifications reach the iOS build of the app on a user's iPhones and iPads.
- [Do not disturb](/reference/status/#do-not-disturb) (beta): While someone is on do not disturb, sends push nothing to their devices and keep inbox notifications in the bell for later.
- [Notification bell](/reference/notifications/#the-bell) (beta): The top bar shows how many inbox notifications are unread; its panel opens each one, marks them read and turns push on or off for this device.
