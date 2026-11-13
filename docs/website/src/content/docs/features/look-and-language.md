---
title: Look and language
description: The app's colours, name, icon, language and installation.
---

- [Theme](/reference/theme/): One CSS file sets the app's colours, corners and fonts for light and dark, and keeps working on every release.
- [Dark mode](/reference/theme/#light-dark-or-the-system): Each user picks light, dark or the system setting.
- [App name, icon and colours](/reference/app-identity/): The app's own name, icon and colours in the sidebar, sign-in page, browser tabs, API docs, `/favicon.ico`, home-screen icon and mail; an app without an icon of its own shows a neutral mark rather than Protobase's.
- [Runs on Protobase note](/reference/app-identity/#runs-on-protobase-note): A host can end the sign-in page on a small "Runs on Protobase" line by setting `PROTOBASE_RUNS_ON_NOTE=true`; without it there is no note.
- [Logo and favicon](/reference/theme/#logo-and-favicon): Your own favicon or logo replaces Protobase's.
- [Named icons](/reference/layouts/#named-actions): Actions, key facts and card meta show an icon picked by name from a set, such as `play`, `bed` or `cpu`.
- [English and Dutch](/reference/languages/): The built-in screens come in English and Dutch, with numbers and dates written to match.
- [Installable app](/reference/installable-app/): The admin installs as an app on phones and computers, and says when the server cannot be reached.
- [Start from the last pages seen](/reference/installable-app/#starting-from-the-last-pages-seen): Someone signed in opens the app on what it showed last time, muted with a spinner by the title until it is refreshed in the background.

## Accessibility

- Reduced motion: When the system asks for less motion, animations and pulsing dots stop.
- [Text size](/reference/theme/#text-size): All text grows with the reader's text size, in the browser and with the phone's text size in the iOS and Android app.
- Screen readers: Sidebar groups are headings to jump between, each list card reads as one link named by its title, filters read their values' labels, and each page has one main area with headings in order.
