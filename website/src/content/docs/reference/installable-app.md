---
title: Installable app
description: The admin app installs as an app of its own on phones and computers, named for the app, and opens without a network to say the server is out of reach.
---

Every app built with `protobase build` can be installed from the browser, as a Progressive Web App: Chrome and Edge offer **Install** in the address bar, Android's browsers **Add to home screen**, and Safari on iPhone and iPad **Share > Add to Home Screen**. The installed app opens in a window of its own, without the browser's toolbars, at the app's home page.

There is nothing to set up. The app installs under its name, `appName` or `PROTOBASE_APP_NAME` (see [auth configuration](/reference/auth/#configuration)), with its favicon, `protobase.favicon.svg` (see [Logo and favicon](/reference/theme/#logo-and-favicon)), as its icon. Safari takes no SVG icon and shows a picture of the page on the home screen instead.

## The manifest

The app's page links its web app manifest at `/api/manifest.webmanifest`, which the server answers to anyone, without a token:

```json
{
  "name": "Property Finder",
  "short_name": "Property Finder",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "icons": [{ "src": "/protobase.favicon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

## Without a network

The data stays online: the installed app reads and writes through the API as the browser tab does, and nothing works offline. The page registers a service worker, `/protobase.sw.js` in the bundle's `public/`, which keeps only the app itself, so the app still opens without a network and says it cannot reach the server.

- A page always comes from the server while it answers, and from the cache only when the network fails.
- The files under `/assets`, named by their content, come from the cache once loaded. The page and what it loads first are cached when the worker installs.
- The theme and the favicon come from the server, with the cached copy used when the network fails.
- Nothing else is cached: the API, the plugins and other sites go to the network as without the worker.

Each build of the app has its own worker, which replaces the previous one and drops its cache on the next visit. `protobase dev` registers no worker, so the dev server's changes always show.
