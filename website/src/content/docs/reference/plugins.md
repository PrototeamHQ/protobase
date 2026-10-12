---
title: Plugins
description: React code the admin app loads when it starts instead of building it in, so it keeps working while Protobase moves on.
---

A plugin is a `protobase.ui.tsx` that the admin app loads at runtime instead of building it in. It provides what a project's own `protobase.ui.tsx` provides: [custom components](/reference/custom-components/) for list displays, record sections, page elements and the assistant's widget parts, action handlers and shell slots. It is built once, on its own, and served from any URL; the app lists it, and every app on a version that fits loads it.

Plugins are how an app keeps code of its own while it follows Protobase's releases: Protobase is maintained for you, and a plugin built today keeps working on the releases that come after it. They are written by an app's developers and by Protobase itself, and they run in the app with the signed-in user's rights, like the app's own code, so load only plugins you trust.

[Your first plugin](/guides/first-plugin/) builds one, step by step.

## How a plugin stays working

A project's `protobase.ui.tsx` is built together with the admin app, against the `@protobase/ui` installed in the project. A newer release of the app needs a new build of both. A plugin is built against a promise instead, and the app supplies the rest when it loads it.

1. **The app shares its modules.** The admin app hands four modules to plugins: `react`, `react/jsx-runtime`, `react-dom` and `@protobase/ui`. Its `index.html` maps those names to the app's own files with an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), so a plugin's `import { useList } from '@protobase/ui'` runs on the app's copy: one React, one query cache, one signed-in session and the app's version of every hook and component. A plugin carries only its own code, and gets the fixes of every release the app moves to.
2. **The plugin API is a promise.** What a plugin can import, the four modules and every export of `@protobase/ui`, is the plugin API, numbered: `pluginApi` is 1. Releases add to it but never remove or change what is in it; only a new plugin API does, as for a new major version of React. So a plugin keeps working on every release of the plugin API it was built for, with no rebuild. Below 1.0 a minor release may change how a project's config is written, but not the plugin API.
3. **The app checks before it loads.** A plugin's `plugin.json` says which plugin API and which Protobase versions it is built for. The app loads a plugin only when it has that plugin API and its own version is in the plugin's range; it never runs the code of one that does not fit.
4. **A plugin that does not fit is turned off, not the app.** Its components draw what a missing component draws, the app's admins see why it is off, and everything else works as before. A component that throws while drawing shows a warning in its own place.

## Writing a plugin

A plugin is a folder with a `protobase.ui.tsx` and a `package.json` that depends on `@protobase/ui`, the version it is built for, and on `react`:

```
sales-tools/
  package.json
  protobase.ui.tsx
  components/draft-orders.tsx
```

```tsx
// protobase.ui.tsx
import { definePlugin } from '@protobase/ui'

export { DraftOrders } from './components/draft-orders'

export default definePlugin({ name: 'sales-tools', actions: { remindCustomer } })
```

It is written as a project's `protobase.ui.tsx` is: each component exported under the PascalCase name the config declares, from a file of its own, and the rest in the default export, `definePlugin({ name, actions, shell, extends })` (the same fields as `defineUi`). Its components use the hooks and components of `@protobase/ui`, which read the API as the signed-in user, under the same access rules as everything else.

**Imports.** `react`, `react/jsx-runtime` (the JSX), `react-dom` and `@protobase/ui`, by those names, come from the app. Everything else a plugin imports, its own files, icons or a chart library, is built into it. Other modules of those packages, such as `react-dom/client` or a file inside `@protobase/ui`, fail the build: a copy of its own would not work with the app's. Read data with `@protobase/ui`'s hooks (`useList`, `useRecord`, `useClient`), which share the app's cache: a data library of the plugin's own keeps a cache of its own.

**Styling.** Use Tailwind classes, as the app's own code does. The plugin's stylesheet holds the utilities its files use and nothing else, no reset and no global style, and each reads the app's theme: `bg-primary` is the app's primary color whatever the app's version, and a token the app does not set falls back to Tailwind's default.

**Its own settings.** `usePlugin()` gives a plugin's components the plugin they belong to:

```tsx
import { usePlugin } from '@protobase/ui'

export const Greeting = () => {
  const { name, version, url, settings } = usePlugin()
  return <p>{`${name} ${version}: ${String(settings.greeting ?? 'hello')}`}</p>
}
```

| `usePlugin()` | |
| --- | --- |
| `name` | The plugin's name, from its `plugin.json`. |
| `version` | Its own version, from its `package.json`, when it has one. |
| `url` | Its `plugin.json`: `new URL('./data.json', url)` finds a file served beside it. |
| `settings` | What the app gives it in `options.plugins` (see [loading](#loading)), `{}` otherwise. |

It works in the components a plugin registers and everything they render, and throws anywhere else.

## Declaring its components in the config

A layout or view declares a plugin's component as it declares any custom component, with `component()` from `@protobase/layout`, naming the plugin that provides it:

```tsx
export const DraftOrders = component('DraftOrders', { plugin: 'sales-tools' })
```

The name is what joins the two, as for a project's component. `plugin` tells `protobase build` that the project's `protobase.ui.tsx` does not have it, so the build does not fail on it (see [Components](/reference/custom-components/#components)). Without the plugin, the app draws a warning in its place.

## Building

```sh
protobase build-plugin [dir] [--out <dir>] [--name <name>]
```

Builds the plugin in `dir` (default: the current folder) into `--out` (default: `dist` in it):

```
dist/
  plugin.json
  assets/index-<hash>.js      the module: protobase.ui.tsx and what it imports, but the shared modules
  assets/styles-<hash>.css    the utilities its files use
```

The output folder is emptied first, so it must not hold the plugin's own files. The module may come with chunks of its own (`import()` in the plugin), beside it in `assets/`. See [build-plugin](/reference/cli/#build-plugin) for the details.

`plugin.json` tells the app what it loads:

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

| | |
| --- | --- |
| `name` | The plugin's name: `--name`, else its `package.json`'s `name`, else its folder's. |
| `version` | Its `package.json`'s `version`, when it has one. |
| `api` | The plugin API of the `@protobase/ui` it is built with. |
| `protobase` | The Protobase versions it runs on: from that `@protobase/ui`'s version on, unless its `package.json` says otherwise (see [versions](#versions)). |
| `entry`, `css` | The module and the stylesheet, relative to `plugin.json`. |

## Loading

The app loads the plugins `/api/meta` names to the signed-in user, in this order:

1. those `createAdmin`'s `options.plugins` lists, in `protobase.config.ts`;
2. those `PROTOBASE_PLUGINS` lists: URLs separated by commas, which a hosting platform sets for the plugins it adds to its apps.

```ts
// protobase.config.ts
export default {
  config,
  options: {
    plugins: [
      { url: 'https://plugins.example.com/sales-tools/plugin.json' },
      { url: '/plugins/board/plugin.json', settings: { columns: 3 }, roles: ['admin', 'sales'] },
    ],
  },
}
```

| `options.plugins[]` | |
| --- | --- |
| `url` | The plugin's `plugin.json`: an `https://` or `http://` URL, or a path on the app's own origin. |
| `settings` | Data the plugin reads with `usePlugin()`. |
| `roles` | When set, only callers with one of these roles load it; without, everyone does. This decides what the app loads, not what anyone may do: the API's access rules still decide that. |

`options.plugins: false` turns both off. A URL that is not one stops the server at startup, naming where it came from. Each URL is loaded once.

When the user signs in, the app reads each `plugin.json`, then loads the module and the stylesheet of each plugin that fits, and draws once they have loaded, or after ten seconds at most: a slower plugin comes in when it arrives. So a host serves them like this:

- `plugin.json` without caching, or with a short one (`Cache-Control: no-cache`): a new build of the plugin reaches every app on its next load.
- The files in `assets/`, named by their content, forever (`Cache-Control: public, max-age=31536000, immutable`).
- From another origin than the app's, with `Access-Control-Allow-Origin` (`*` is fine for public files), since the browser loads modules and `plugin.json` with CORS.

The plugins are merged before the app's own `protobase.ui.tsx`, in the order listed. Two of them cannot define one name: a plugin that defines a component or action handler the app or an earlier plugin defines is turned off, and the one before keeps it.

`protobase dev` loads plugins the same way, its page sharing the same four modules. The project's own React code stays in `protobase.ui.tsx`, built into the app with hot reload.

## Versions

A plugin is built for one plugin API and a range of Protobase versions, both written by `build-plugin` into `plugin.json`:

- `api` is the plugin API of the `@protobase/ui` installed for the plugin.
- `protobase` is `>=` that `@protobase/ui`'s version: the plugin may use anything that version has. To run on older releases too, name the range in the plugin's `package.json`:

  ```json
  { "engines": { "protobase": ">=0.11.1" } }
  ```

  A range is comparators separated by spaces, all of which must hold: `>=`, `>`, `<=`, `<` or `=` and an `x.y.z` version, such as `>=0.11.1 <2.0.0`. The build refuses one that leaves out the version it is built with. If the plugin uses something an older release in its range does not have, it fails to load there and is turned off, as described below.

The app loads a plugin when the plugin's `api` is its own and its version is in the plugin's `protobase` range. Protobase keeps the plugin API through its releases and starts a new one only when a plugin built for the old one could break:

- an export of `@protobase/ui` removed, or changed in a way its users would notice;
- a module added to or removed from the four the app shares;
- a new major version of React, which the app and every plugin share.

A plugin built for an older plugin API needs a new build against a `@protobase/ui` of the new one. `pluginApi` and `protobaseVersion`, exported by `@protobase/ui`, give a plugin the app's own at runtime.

## When a plugin is off

Nothing a plugin does stops the app. Each of these turns off that plugin alone:

- its `plugin.json` cannot be read, or is not one;
- it is built for another plugin API, or for a range without the app's version;
- its module cannot be loaded, or does not link: it imports something the app's `@protobase/ui` does not have;
- it defines a name the app or an earlier plugin defines.

Its components then show the warning of a missing component, and widget parts their fallback card. The app's admins (the `admin` role) see a notice above the app naming each plugin that is off and why, such as "The plugin sales-tools is off: it needs Protobase >=0.12.0, and this app runs 0.11.1." Everyone else sees only the warnings. An action handler that throws shows its error in a toast, as a project's does, and a component that throws while drawing shows "*Name* could not be drawn." in its own place.

## API

From `@protobase/ui`:

| | |
| --- | --- |
| `definePlugin(config)` | Typed identity for a plugin's default export: `name`, `actions`, `shell`, `extends`, as `defineUi`. |
| `usePlugin()` | The plugin the calling component belongs to (see [above](#writing-a-plugin)). |
| `pluginApi` | The plugin API of the app's `@protobase/ui`. |
| `protobaseVersion` | The Protobase version of the app's `@protobase/ui`. |

From `@protobase/layout`: `component(name, { plugin })` (see [above](#declaring-its-components-in-the-config)). From `@protobase/server`: `options.plugins` of `createAdmin` and `PROTOBASE_PLUGINS` (see [loading](#loading)).
