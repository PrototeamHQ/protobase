---
title: Your first plugin
description: Build a plugin, serve it, load it into an app and change it without rebuilding the app.
---

Sam's sales team wants the newest draft orders on their start page, each a link to the order. That is a few lines of React. Written in the app's `protobase.ui.tsx`, it would be that app's alone, shipped with each of its builds. Written as a [plugin](/reference/plugins/) of its own, it is built once, served on its own, and loaded by every app that lists it when it starts, whatever release the app runs.

This guide builds that plugin, serves it, loads it into an app and changes it without touching the app. It uses the orders of the ERP example (`tests/apps/erp`); any resource of yours works the same.

## 1. A folder for the plugin

A plugin is a folder of its own, next to the app's project or anywhere else, with a `package.json` that names it:

```json
{
  "name": "sales-tools",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
```

It depends on `@protobase/ui`, the version it is built for, on `react`, and on `@protobase/cli` to build it:

```sh
bun add @protobase/ui react
bun add -d @protobase/cli @types/react
```

Its entry is a `protobase.ui.tsx`, written like a project's: each component exported under its name, from a file of its own, and the rest in `definePlugin`:

```tsx
// protobase.ui.tsx
import { definePlugin } from '@protobase/ui'

// The plugin's components, each from a file of its own, exported by the name the config declares.
export { DraftOrders } from './components/draft-orders'

export default definePlugin({ name: 'sales-tools' })
```

## 2. The component

```tsx
// components/draft-orders.tsx
import { RecordLink, useList, usePlugin } from '@protobase/ui'

/** The five newest draft orders, each a link to its page, signed with the plugin that draws them. */
export const DraftOrders = () => {
  const plugin = usePlugin()
  const drafts = useList('orders', { filter: "status = 'draft'", orderBy: 'created_at desc', pageSize: 5 })
  return (
    <div>
      <ul className="divide-y divide-border">
        {drafts.items.map((order) => (
          <li key={String(order.id)} className="flex justify-between py-1.5">
            <RecordLink resource="orders" recordKey={String(order.id)} className="font-medium text-primary-text hover:underline">
              {String(order.number)}
            </RecordLink>
            <span className="tabular-nums text-muted-foreground">{String(order.total)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-faint-foreground">{`${plugin.name} ${plugin.version}`}</p>
    </div>
  )
}
```

Everything it imports from `@protobase/ui` and `react` will be the app's own at runtime: `useList` reads the API as the signed-in user, through the app's cache, and `RecordLink` goes to the order's page through the app's addresses. `usePlugin()` tells it which plugin it is part of. The Tailwind classes draw with the app's theme: `text-primary-text` is the app's link color.

## 3. Build it

```sh
bun run protobase build-plugin
```

```
built dist: plugin.json, assets/index-DDnoullN.js and assets/styles-CToS5pKa.css (sales-tools, plugin API 1, Protobase >=0.11.1)
```

`dist/assets/index-<hash>.js` is the plugin's module: its own code, with `react`, `react/jsx-runtime`, `react-dom` and `@protobase/ui` left as imports for the app to supply. `styles-<hash>.css` holds the utilities its classes use, and nothing else. `plugin.json` names both, the plugin API they are built for and the Protobase versions they run on:

```json
{
  "name": "sales-tools",
  "version": "1.0.0",
  "api": 1,
  "protobase": ">=0.11.1",
  "entry": "assets/index-DDnoullN.js",
  "css": "assets/styles-CToS5pKa.css"
}
```

## 4. Serve it

Any static host serves a plugin: a CDN, a bucket, another app. The app loads it from wherever its `plugin.json` is, with CORS when that is another origin. While you work on it, a few lines of Bun do:

```ts
// serve.ts: the plugin's dist folder with CORS, as any static host or CDN would serve it.
Bun.serve({
  port: 4000,
  async fetch(request) {
    const file = Bun.file(`dist${new URL(request.url).pathname}`)
    if (!(await file.exists())) return new Response('Not found', { status: 404 })
    return new Response(file, { headers: { 'access-control-allow-origin': '*' } })
  },
})
```

```sh
bun serve.ts
```

`http://localhost:4000/plugin.json` now answers.

## 5. Load it into the app

In the app's project, list the plugin in `.env`:

```sh
PROTOBASE_PLUGINS=http://localhost:4000/plugin.json
```

and put its component on the start page, declared with the plugin that provides it:

```tsx
// config/overview/page.tsx
/** @jsxImportSource @protobase/layout */
import { Card, component, page, Page } from '@protobase/layout'

/** The newest draft orders, drawn by the sales-tools plugin. */
export const DraftOrders = component('DraftOrders', { plugin: 'sales-tools' })

export const salesOverview = page(
  'overview',
  <Page title="Sales overview">
    <Card title="Draft orders">
      <DraftOrders />
    </Card>
  </Page>,
)
```

`{ plugin: 'sales-tools' }` tells `protobase build` that the project's own `protobase.ui.tsx` does not have the component, so it does not fail on it. Start the app with `bun run protobase dev` and sign in: the start page shows the card with the five newest drafts, and `sales-tools 1.0.0` under them. `/api/meta` named the plugin, the app read its `plugin.json`, saw that it fits, and loaded its module and stylesheet.

## 6. Change the plugin, not the app

Show three orders instead of five: set `pageSize: 3` in `components/draft-orders.tsx` and build the plugin again:

```sh
bun run protobase build-plugin
```

Reload the app. The card shows three orders, and the app was neither rebuilt nor restarted: it found the new module through the same `plugin.json`. That is how a plugin ships: a new build where its `plugin.json` is served.

## 7. Ship it

Put `dist/` on a static host, and list its `plugin.json` in the deployed app's `PROTOBASE_PLUGINS`, or in the `plugins` of its `protobase.config.ts`, which can also give the plugin settings and limit it to some roles (see [loading](/reference/plugins/#loading)). Serve `plugin.json` without caching, so a new build reaches the apps on their next load, and the files in `assets/`, whose names change with their content, as long as you like.

## When the app moves on

The app updates to a new release of Protobase. Nothing happens to the plugin: within plugin API 1, every release keeps what the plugin imports, and the plugin runs on the newer `@protobase/ui` it is handed, its fixes included.

If the app were older than the plugin needs, it would not load the plugin at all. Its admins would see a notice below the top bar, such as "The plugin sales-tools is off: it needs Protobase >=0.12.0, and this app runs 0.11.1.", and the card would show a warning in place of the drafts, while the rest of the app works as before. [Versions](/reference/plugins/#versions) has the rules.
