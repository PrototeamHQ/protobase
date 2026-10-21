---
title: Installable app
description: The admin app installs as an app of its own on phones and computers, named for the app, and opens without a network to say the server is out of reach.
---

Every app built with `protobase build` can be installed from the browser, as a Progressive Web App: Chrome and Edge offer **Install** in the address bar, Android's browsers **Add to home screen**, and Safari on iPhone and iPad **Share > Add to Home Screen**. The installed app opens in a window of its own, without the browser's toolbars, at the app's home page.

There is nothing to set up. The app installs under its name, `PROTOBASE_APP_NAME` or `appName`, with its favicon, `protobase.favicon.svg`, as its icon, and the colours of `app` in `protobase.config.ts` (see [App identity](/reference/app-identity/)). Safari takes no SVG icon: give the project a `protobase.apple-touch-icon.png`, or it shows a picture of the page on the home screen instead.

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
  "theme_color": "#0d9488",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/protobase.favicon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "/protobase.icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/protobase.icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/protobase.icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

The colours and each PNG are there only when the project has them.

## Without a network

The data stays online: the installed app reads and writes through the API as the browser tab does, and nothing works offline. The page registers a service worker, `/protobase.sw.js` in the bundle's `public/`, which keeps only the app itself, so the app still opens without a network and says it cannot reach the server.

- A page always comes from the server while it answers, and from the cache only when the network fails.
- The files under `/assets`, named by their content, come from the cache once loaded. The page and what it loads first are cached when the worker installs.
- The theme and the favicon come from the server, with the cached copy used when the network fails.
- Nothing else is cached: the API, the plugins and other sites go to the network as without the worker.

Each build of the app has its own worker, which replaces the previous one and drops its cache on the next visit. `protobase dev` registers no worker, so the dev server's changes always show.
