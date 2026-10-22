---
title: Plugins
description: React code the admin app loads when it starts instead of building it in, so it keeps working while Protobase moves on.
---

A plugin is a `protobase.ui.tsx` that the admin app loads at runtime instead of building it in. It provides what a project's own `protobase.ui.tsx` provides: [custom components](/reference/custom-components/) for list displays, record sections, page elements, record cards and the assistant's widget parts, [field types](#field-types), action handlers and shell slots. It is built once, on its own, and served from any URL; the app lists it, and every app on a version that fits loads it.

A project's own `protobase.ui.tsx` is a plugin too: `protobase build` builds it as the plugin `app` beside a prebuilt admin app, and builds each `--extend` folder's the same way. So everything below holds for the code an app's own developers write, for code shared across apps, and for code Protobase adds.

Plugins are written by an app's developers and by Protobase itself, and they run in the app with the signed-in user's rights, like the app's own code, so load only plugins you trust.

[Your first plugin](/guides/first-plugin/) builds one, step by step. [Adding a field type](/guides/field-type/), [A custom record card](/guides/record-card/) and [Theming an app](/guides/theme-an-app/) add to an app, and [Moving onto the plugin build](/guides/plugin-build/) moves an existing project's `protobase.ui.tsx` onto it.

## Who maintains what

Plugins split the work of keeping an app current. Protobase maintains the admin app, the API and the server; an app's developers maintain their plugins, and those seldom need work. A plugin is built against the plugin API, which releases add to but never break, so the same build keeps loading as the app moves to newer releases, and gets their fixes and new features on the way. Nobody ports it, rebuilds it or tests it again for each release; it needs a new build only when Protobase starts a new plugin API (see [Versions](#versions)).

What still follows Protobase's releases is the rest of the bundle. Below 1.0 a new minor version may change how `data.ts`, `ui.ts` and the server config are written, and a bundle is served on the runtime of the version the project is pinned to, so moving to a new minor means installing that version and running `protobase build` again, after any change the release notes ask of the config (see [Bundles and runtimes](/reference/versioning/#bundles-and-runtimes)). The plugins' code stays as it is. Within a minor, where features ship as patches below 1.0, a host that serves the newer release's [shell](#the-shell) gives the app its fixes with nothing rebuilt.

## How a plugin stays working

Code built together with the app is frozen at the app it was built with: a newer release of the app needs a new build of both. A plugin is built against a promise instead, and the app supplies the rest when it loads it.

1. **The app is built once per release.** The admin app, the shell, is the same for every project. Each release of `@protobase/ui` ships it prebuilt, and `protobase build` copies it into the bundle beside the project's plugins and theme. A host that has the shell of a newer release can serve that one in its place (see [the shell](#the-shell)), so an app gets the release's fixes without a rebuild of its own code.
2. **The app shares its modules.** The admin app hands four modules to plugins: `react`, `react/jsx-runtime`, `react-dom` and `@protobase/ui`. Its `index.html` maps those names to the app's own files with an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), so a plugin's `import { useList } from '@protobase/ui'` runs on the app's copy: one React, one query cache, one signed-in session and the app's version of every hook and component. A plugin carries only its own code, and gets the fixes of every release the app moves to.
3. **The plugin API is a promise.** What a plugin can import, the four modules and every export of `@protobase/ui`, is the plugin API, numbered: `pluginApi` is 1. Releases add to it but never remove or change what is in it; only a new plugin API does, as for a new major version of React. So a plugin keeps working on every release of the plugin API it was built for, with no rebuild. Below 1.0 a minor release may change how a project's config is written, but not the plugin API.
4. **The app checks before it loads.** A plugin's `plugin.json` says which plugin API and which Protobase versions it is built for. The app loads a plugin only when it has that plugin API and its own version is in the plugin's range; it never runs the code of one that does not fit.
5. **A plugin that does not fit is turned off, not the app.** Each place it would fill draws a fallback, the app's admins see why it is off, and everything else works as before. A component that throws while drawing shows its fallback in its own place.
6. **The look is values, not rules.** A project themes the app with a [`protobase.theme.css`](/reference/theme/) that holds only values of the app's tokens, and a plugin's stylesheet holds only utilities that read those tokens. Neither reaches into the app's markup, so neither breaks when the app's markup changes.

## Extension points

Each place a plugin can fill is an extension point. The config names it, or a plugin adds to it, and each defines the props the app passes, what the app draws when the plugin is missing or off, and where its error boundary sits, so one failing part never takes more than its own place.

| Extension point | Named by | Registered as | Gets | Missing, off or throwing |
| --- | --- | --- | --- | --- |
| View: [list display](/reference/custom-components/#list-displays), [record section](/reference/custom-components/#record-sections), [page element](/reference/custom-components/#components) | `component('Name')` in `d.custom`, `l.custom` or a layout | A PascalCase export of `protobase.ui.tsx` | Its props, field references as names; `useListDisplay()`, `useLayoutRecord()` | A warning in its place: "No component is registered as *Name*" or "*Name* could not be drawn." |
| [Record card](/reference/custom-components/#record-cards) | `d.cards(fields, { card: component('Name') })` | A PascalCase export | `{ row }` | The built-in card: title, subtitle, badge, meta fields |
| [Field type](#field-types) | `r.field.widget('name', props)` in a view's `fields` | `fields: { name: { of, display, editor?, cell? } }` | `{ field, value, props }`, and `onChange`, `invalid` for the editor | The field as it shows without one |
| Widget part (the [assistant](/reference/assistant/#widget-parts)) | A widget part's name | A PascalCase export | The part's props | The part's fallback card |
| [Action handler](/reference/custom-components/#action-handlers) | `a.action('name')` in a view | `actions: { name }` | `ActionContext` | The button is disabled |
| [Shell slot](/reference/custom-components/#shell-slots) | Nothing: drawn on every page | `shell: { actions, rightPanel, logo, bell }` | Nothing; `logo` gets `compact`, `workspace`, `appName` and `appIcon` | Not drawn; Protobase's logo for `logo`, its notification bell for `bell` |
| [Before sign-in](#before-sign-in) | `beforeSignIn: true` where the plugin is listed | `beforeSignIn` | `children`, `params`, `removeParams`, `signedIn` | The pages as they are without it |

Components and cards share one namespace of names, which `component('Name')` joins to the export; field types and action handlers each have their own. Props that name fields go through the same walker as everything else in `/api/meta`, so a user who may not read a field never gets it in a component's props; a field type's `props` are plain data, and a field the user may not read is left out of the view, field type and all.

New extension points are new optional keys of `definePlugin`, so adding one never changes what a plugin built before it does.

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

It is written as a project's `protobase.ui.tsx` is: each component exported under the PascalCase name the config declares, from a file of its own, and the rest in the default export, `definePlugin({ name, actions, fields, shell, beforeSignIn, extends })` (`defineUi` is the same function). Its components use the hooks and components of `@protobase/ui`, which read the API as the signed-in user, under the same access rules as everything else.

**Imports.** `react`, `react/jsx-runtime` (the JSX), `react-dom` and `@protobase/ui`, by those names, come from the app. Everything else a plugin imports, its own files, icons or a chart library, is built into it. Other modules of those packages, such as `react-dom/client` or a file inside `@protobase/ui`, fail the build: a copy of its own would not work with the app's. Read data with `@protobase/ui`'s hooks (`useList`, `useRecord`, `useClient`), which share the app's cache: a data library of the plugin's own keeps a cache of its own.

**Styling.** Use Tailwind classes, as the app's own code does. The plugin's stylesheet holds the utilities its files use and nothing else, no reset and no global style, and each reads the app's [tokens](/reference/theme/): `bg-primary` is the app's primary color and `rounded-md` its radius, whatever the app's version and whatever its theme, and a token the app does not set falls back to Tailwind's default.

**Top-level code.** The build loads `protobase.ui.tsx` once in Node to read its field types, so code at the top level of its modules runs there. Keep browser-only work (`window`, `document`, `localStorage`) inside components and handlers.

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
| `settings` | What the app gives it in `plugins` (see [loading](#loading)), `{}` otherwise. |

It works in the components, field types, shell slots and `beforeSignIn` a plugin registers and everything they render, and throws anywhere else.

## Declaring its components in the config

A layout or view declares a plugin's component as it declares any custom component, with `component()` from `@protobase/layout`, naming the plugin that provides it:

```tsx
export const DraftOrders = component('DraftOrders', { plugin: 'sales-tools' })
```

The name is what joins the two, as for a project's component. `plugin` tells `protobase build` that the project's `protobase.ui.tsx` does not have it, so the build does not fail on it (see [Components](/reference/custom-components/#components)). Without the plugin, the app draws the component's fallback in its place.

## Field types

A field type shows and edits one kind of value everywhere the app shows a field: a star rating for a score, steps for a status, a color swatch for a hex code. A plugin registers it by name, with the storage types it shows, and a view picks it for a field:

```tsx
// protobase.ui.tsx
import { definePlugin } from '@protobase/ui'
import { StepsDisplay, StepsEditor } from './components/steps'

export default definePlugin({ fields: { steps: { of: ['enum'], display: StepsDisplay, editor: StepsEditor } } })
```

```ts
// config/repairs/ui.ts
view<typeof repairs>('repairs').fields((r) => ({ status: r.status.widget('steps', { done: 'collected' }) }))
```

| `fields.<name>` | |
| --- | --- |
| `of` | The storage types it shows, from `f.*`: `'text'`, `'integer'`, `'decimal'`, `'enum'`, `'boolean'`, `'date'`, ... A field of another type shows as it would without the field type. |
| `display` | Shows a value: on the record page when the field may not change, in the record's summary, on cards and in page elements. |
| `editor` | Edits a value, on the record page and the create form, when the field may change. Without it, the field keeps its built-in input. A JSON field has no built-in input: it is on these forms only when the view picks a field type for it, and only that field type's editor changes it. Files and relations are uploaded and chosen as the app does it; their field types only show them. |
| `cell` | Shows a value in a table cell; `display` when left out. |

Each part gets:

| Props | |
| --- | --- |
| `field` | The field's model: `name`, `type`, `nullable`, `enumValues` and the rest of `FieldModel`. |
| `value` | The value as the API gives it, `null` when empty: a number for an integer, text for a decimal, a boolean for a boolean. |
| `props` | What the view gives in `.widget(name, props)`, `{}` without; plain data. |
| `onChange(value)` | The editor's only: sets the value, as the API takes it, `null` to empty it. The record is saved with the page's Save. |
| `invalid` | The editor's only: whether the value it holds is refused, as the page shows under the field. |

`FieldWidgetProps<Value, Props>` and `FieldWidgetEditorProps<Value, Props>` from `@protobase/ui` type them, and `FieldWidget` a whole field type.

**Checks.** The field type's storage types are checked against the views twice. `protobase build` loads each of the bundle's plugins once in Node and writes the storage types of each field type it registers into `plugin.json` and the bundle's manifest; the serve runtime refuses to start when a view shows a field with one of them that does not show its storage type, naming the view, the field and what the field type shows. The app checks again when it draws: a field type no loaded plugin registers, or one that does not show the field's storage type, leaves the field as it shows without one. A field type a remote plugin provides is checked only there, since the server never loads remote code.

**Fallbacks.** Each part draws inside an error boundary whose fallback is the field's built-in rendering, so a field type that throws costs only its own field, which still shows its value. A plugin that is off leaves every field it would draw as it shows without it.

[Adding a field type](/guides/field-type/) builds one step by step.

### Members

`members` is a field type Protobase brings, for a JSON field that holds an array of user ids, such as who may read a private channel. No plugin registers it; a view picks it as it picks any other:

```ts
// config/channels/data.ts
resource('channels').fields({ id: f.uuid(), name: f.text(), member_ids: f.json() })

// config/channels/ui.ts
view<typeof channels>('channels').fields((r) => ({ member_ids: r.member_ids.widget('members') }))
```

The create form and the record's form pick the members of the organization the session works in by name: typing narrows them, each choice is a token whose button takes it off again, and choosing a chosen member takes them off too. It stores their user ids, the ids `.author()` stores and [`useMembers()`](/reference/custom-components/#members-names) gives, never membership ids. The record page, cards and the list's table show each member by avatar and name; an id that is no longer a member shows as an unknown member. A JSON field is on a form only through a field type that edits it, so without the hint `member_ids` stays read-only. The field needs [organizations](/reference/auth/#organizations); in an app without them it says so in place of the members. <gap>The members picker cannot search on the server because a server-side people resource is not implemented, so it loads the whole list in the browser, as `useMembers()` does.</gap> A plugin that registers a field type named `members` replaces it, and the server refuses to start when a view picks it for a field that is no JSON.

## Building

```sh
protobase build-plugin [dir] [--out <dir>] [--name <name>] [--source-maps]
```

Builds the plugin in `dir` (default: the current folder) into `--out` (default: `dist` in it):

```
dist/
  plugin.json
  assets/index-<hash>.js      the module: protobase.ui.tsx and what it imports, but the shared modules
  assets/styles-<hash>.css    the utilities its files use
```

The output folder is emptied first, so it must not hold the plugin's own files. The module may come with chunks of its own (`import()` in the plugin), beside it in `assets/`. See [build-plugin](/reference/cli/#build-plugin) for the details. `protobase build` builds the project's own `protobase.ui.tsx` and each extension's the same way, into the bundle's `public/plugins/<name>/`.

`plugin.json` tells the app what it loads:

```json
{
  "name": "sales-tools",
  "version": "1.0.0",
  "api": 1,
  "protobase": ">=0.12.0",
  "entry": "assets/index-DDnoullN.js",
  "css": "assets/styles-CToS5pKa.css",
  "fields": { "steps": ["enum"] }
}
```

| | |
| --- | --- |
| `name` | The plugin's name: `--name`, else its `package.json`'s `name`, else its folder's. A project's own is `app`. |
| `version` | Its `package.json`'s `version`, when it has one. |
| `api` | The plugin API of the `@protobase/ui` it is built with. |
| `protobase` | The Protobase versions it runs on: from that `@protobase/ui`'s version on, unless its `package.json` says otherwise (see [versions](#versions)). |
| `entry`, `css` | The module and the stylesheet, relative to `plugin.json`. |
| `fields` | The field types it registers, each with the storage types it shows. Only when it registers some. |

## Loading

The app loads the plugins `/api/meta` names to the signed-in user, in this order:

1. the bundle's own, from its manifest: each `--extend` folder's, then the project's (`app`), for everyone;
2. those `plugins` in `protobase.config.ts` lists;
3. those `PROTOBASE_PLUGINS` lists: URLs separated by commas, which a hosting platform sets for the plugins it adds to its apps;
4. those `PROTOBASE_PLUGINS_BEFORE_SIGN_IN` lists, the same way, which also load [before sign-in](#before-sign-in).

```ts
// protobase.config.ts
export default defineConfig({
  plugins: [
    { url: 'https://plugins.example.com/sales-tools/plugin.json' },
    { url: '/plugins/board/plugin.json', settings: { columns: 3 }, roles: ['admin', 'sales'] },
  ],
})
```

| `plugins[]` | |
| --- | --- |
| `url` | The plugin's `plugin.json`: an `https://` or `http://` URL, or a path on the app's own origin. |
| `settings` | Data the plugin reads with `usePlugin()`. |
| `roles` | When set, only callers with one of these roles load it; without, everyone does. This decides what the app loads, not what anyone may do: the API's access rules still decide that. |
| `beforeSignIn` | `true` loads it [before sign-in](#before-sign-in) too, for everyone; it cannot have `roles`. Off by default. |

`plugins: false` turns off all but the first; the bundle's own plugins are the app's own UI and always load. A URL that is not one stops the server at startup, naming where it came from, and so does a plugin with both `roles` and `beforeSignIn`. Each URL is loaded once, where it is first listed; one `PROTOBASE_PLUGINS_BEFORE_SIGN_IN` lists loads before sign-in wherever it is listed.

When the user signs in, or before for a plugin that loads [before sign-in](#before-sign-in), the app reads each `plugin.json`, then loads the module and the stylesheet of each plugin that fits, and draws once they have loaded, or after ten seconds at most: a slower plugin comes in when it arrives. So a host serves them like this:

- `plugin.json` without caching, or with a short one (`Cache-Control: no-cache`): a new build of the plugin reaches every app on its next load.
- The files in `assets/`, named by their content, forever (`Cache-Control: public, max-age=31536000, immutable`).
- From another origin than the app's, with `Access-Control-Allow-Origin` (`*` is fine for public files), since the browser loads modules and `plugin.json` with CORS.

The plugins are merged in the order listed. Two of them cannot define one name: a plugin that defines a component, action handler or field type an earlier one defines is turned off, and the earlier one keeps it. So the project's own names win over a platform's, and within a bundle the build already fails on such a name.

`protobase dev` loads plugins the same way, its page sharing the same four modules. The project's own `protobase.ui.tsx` is built into the dev page with hot reload instead, merged after the plugins, and keeps its names over theirs.

The components a [remote resource](/reference/remote-resources/#custom-components)'s view names are drawn from the same plugins, by name, so whoever runs a source lists the plugin that provides them with it. Inside one, `useList` and `useRecord` read the source for its resources, and `useResourceClient(resource)` gives the client of the API that serves a resource.

## Before sign-in

Plugins load once someone has signed in, or for a visitor of a project whose anonymous role reads a resource, so no plugin code runs for someone signed out: they get the sign-in page. A plugin listed with `beforeSignIn: true`, or in `PROTOBASE_PLUGINS_BEFORE_SIGN_IN`, loads before that. The sign-in status (`GET /api/auth/status`) names it to everyone, as `plugins`, and the app loads it first and waits for it, as it waits for the others. Its `beforeSignIn` component is drawn around what someone signed out sees: the sign-in page, or the app a visitor browses. Once they are in, it is no longer drawn, and the plugin stays loaded: `/api/meta` names it to everyone, and the app merges its other parts as any plugin's, without loading it again.

So a plugin can sign someone in from a link, such as one a platform hands out with a one-time code:

```tsx
// protobase.ui.tsx
import { useEffect, useRef, useState } from 'react'
import { definePlugin, type BeforeSignInProps } from '@protobase/ui'

const GuestAccess = ({ children, params, removeParams, signedIn }: BeforeSignInProps) => {
  const [code] = useState(() => params.get('access'))
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (!code || started.current) return
    started.current = true
    removeParams(['access'])
    // An endpoint on the app's origin that trades the code for the session cookie.
    void fetch('/guest/exchange', { method: 'POST', body: code })
      .then(signedIn)
      .then((entered) => setFailed(!entered))
  }, [code, removeParams, signedIn])
  if (code && !failed) return <p role="status">Signing you in…</p>
  return children
}

export default definePlugin({ name: 'guest', beforeSignIn: GuestAccess })
```

| `BeforeSignInProps` | |
| --- | --- |
| `children` | What the app shows someone signed out: the sign-in page, or the app a visitor browses. Draw it when the plugin has nothing to do. |
| `params` | The query parameters of the page's address. |
| `removeParams(names)` | Takes those query parameters out of the address, in place of it in the tab's history, as the app does with a used [sign-in link](/reference/auth/#sign-in-links-and-connected-accounts). |
| `signedIn()` | Enters the app with a session something other than the sign-in page started: it reads the session cookie again and shows the app signed in, as the sign-in page does, with no reload. Resolves `false`, and changes nothing, when there is no session. |

The plugin starts the session itself, with a request that sets the app's session cookie on the app's origin; `signedIn()` only tells the app. Several plugins' `beforeSignIn` are drawn one around the other, the first listed outermost, and one that throws leaves the pages as they are. Like every plugin, one loaded before sign-in runs with the rights of whoever opens the app, here someone not signed in, and its `plugin.json` and files are served to them, so list only plugins you trust there.

## The shell

The shell is the admin app: `index.html` and its `assets/`, the same for every project on a release. Each release ships it prebuilt in `@protobase/ui`'s `dist/shell/` and in the [protobase image](/guides/deploy/#images) at `/opt/protobase/shell/`, with a `protobase.shell.json` naming its Protobase version and plugin API, and as `native` the native packages it runs on in the [mobile app](/guides/mobile-app/), which the fingerprint of its [mobile release](/reference/cli/#mobile-releases) names. A bundle carries a copy, so any static host can serve it, and its manifest names that copy's version and paths (`shell` in [the manifest](/reference/cli/#the-manifest)).

A host that keeps the shells of its releases can serve the shell of a newer one for those paths; the app still turns off a plugin that does not load in it. The plugins, the theme and the API stay the bundle's. `protobase serve` does this with its own shell (see [serve](/reference/cli/#serve)). The app then has the newer release's fixes with nothing rebuilt; only a change of the server config's format, a new minor below 1.0, still needs a [rebuild](/reference/versioning/#bundles-and-runtimes).

## Versions

A plugin is built for one plugin API and a range of Protobase versions, both written by `build-plugin` into `plugin.json`:

- `api` is the plugin API of the `@protobase/ui` installed for the plugin, else the CLI's own (always the CLI's for the UI of a bundled project).
- `protobase` is `>=` that `@protobase/ui`'s version: the plugin may use anything that version has. To run on older releases too, name the range in the plugin's `package.json`:

  ```json
  { "engines": { "protobase": ">=0.12.0" } }
  ```

  A range is comparators separated by spaces, all of which must hold: `>=`, `>`, `<=`, `<` or `=` and an `x.y.z` version, such as `>=0.12.0 <2.0.0`. The build checks only the range's form; which versions it holds is the app's to compare when it loads the plugin. If the plugin uses something an older release in its range does not have, it fails to load there and is turned off, as described below.

The app loads a plugin when the plugin's `api` is its own and its version is in the plugin's `protobase` range. Protobase keeps the plugin API through its releases and starts a new one only when a plugin built for the old one could break:

- an export of `@protobase/ui` removed, or changed in a way its users would notice;
- an extension point's props changed in a way a plugin would notice;
- a module added to or removed from the four the app shares;
- a new major version of React, which the app and every plugin share.

A plugin built for an older plugin API needs a new build against a `@protobase/ui` of the new one. `pluginApi` and `protobaseVersion`, exported by `@protobase/ui`, give a plugin the app's own at runtime.

## When a plugin is off

Nothing a plugin does stops the app. Each of these turns off that plugin alone:

- its `plugin.json` cannot be read, or is not one;
- it is built for another plugin API, or for a range without the app's version;
- its module cannot be loaded, or does not link: it imports something the app's `@protobase/ui` does not have;
- it defines a name an earlier plugin defines.

Every place it would fill then draws its fallback (see [Extension points](#extension-points)). The app's admins (the `admin` role) see a notice below the top bar naming each plugin that is off and why, such as "The plugin sales-tools is off: it needs Protobase >=0.12.3, and this app runs 0.12.1." Everyone else sees only the fallbacks. An action handler that throws shows its error in a toast, as a project's does, and a part that throws while drawing shows its fallback in its own place.

## API

From `@protobase/ui`:

| | |
| --- | --- |
| `definePlugin(config)` | Typed identity for a plugin's default export: `name`, `actions`, `fields`, `shell`, `beforeSignIn`, `extends`, as `defineUi`. |
| `BeforeSignInProps` | The props of a plugin's [`beforeSignIn`](#before-sign-in) component. |
| `usePlugin()` | The plugin the calling component belongs to (see [above](#writing-a-plugin)). |
| `useResourceClient(resource)` | The client of the API that serves a resource: the app's own, or a source's for a [remote resource](/reference/remote-resources/). |
| `FieldWidget`, `FieldWidgetProps`, `FieldWidgetEditorProps` | The types of a [field type](#field-types) and of its parts' props. |
| `RecordCardProps` | The props of a [record card](/reference/custom-components/#record-cards), `{ row }`. |
| `AuthLayout`, `CodeForm`, `ResendCodeButton`, `Button`, `buttonClass`, `Input`, `Spinner`, `LogoMark` | The pieces of the app's sign-in pages, for a page of a plugin or a host's own that looks like them. Outside the app, `@protobase/ui/styles.css` is the stylesheet that draws them, for a Vite build with Tailwind. |
| `isFramed`, `useArmedAfterFocus`, `useGuardedPress`, `allowDelayMs` | The connect page's guard against clickjacking and click-through, for a host's own consent screen: it refuses to render when `isFramed()`, and its Allow button spreads `useGuardedPress(armed, onAllow)`, so a press counts only once the page has been in front for `allowDelayMs`, and a press anywhere on the page before then starts that wait again. |
| `pluginApi` | The plugin API of the app's `@protobase/ui`. |
| `protobaseVersion` | The Protobase version of the app's `@protobase/ui`. |

From `@protobase/layout`: `component(name, { plugin })` (see [above](#declaring-its-components-in-the-config)). From `@protobase/schema`: `.widget(name, props)` on a view's fields and `d.cards(fields, { card })` (see [Views](/reference/ui-config/)). From the config: `plugins`; from the environment: `PROTOBASE_PLUGINS` and `PROTOBASE_PLUGINS_BEFORE_SIGN_IN` (see [loading](#loading)). The tokens a plugin's utilities read are in [Theme](/reference/theme/).
