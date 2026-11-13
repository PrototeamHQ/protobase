---
title: App identity
description: The app's name, icon and colours, which its sidebar logo, sign-in page, browser tabs, API docs, home-screen icon, web manifest and mail all follow.
---

An app looks like its own everywhere from three things in its project: its name, its icon and its colours. The sidebar's logo, the sign-in page, the browser tab, the API docs, the icon on a phone's home screen, the [installed app](/reference/installable-app/) and the auth mail all follow them, with no component to write.

| What | Where | Used by |
| --- | --- | --- |
| Name | `name` in `protobase.config.ts` ([config](/reference/config/)), overridden at run time by `PROTOBASE_APP_NAME` | the sidebar's logo, the sign-in page's title ("Sign in to Acme Admin"), the end of every tab title, the title of the [API docs](/reference/api/), the installed app's name, the [mobile app](/guides/mobile-app/)'s name on the phone, passkey and authenticator prompts, auth mail and its sender's name |
| Icon | `protobase.favicon.svg` at the project's root | the browser tab, `/favicon.ico`, the sidebar's logo, the sign-in page, the installed app's icon, the [MCP endpoint](/reference/mcp/#the-apps-icon)'s icon in AI clients; the [mobile app](/guides/mobile-app/#the-icon) shows the image `mobile.icon` names instead, or Protobase's icon |
| Raster icons | optional PNGs beside the SVG, below | the iPhone home screen and Android launchers, which take no SVG |
| Colours | `themeColor` and `backgroundColor` in `protobase.config.ts` | the installed app's title bar and its start screen; `backgroundColor` is also the background of the mobile app's own icon |

```ts
// protobase.config.ts
import { defineConfig } from '@protobase/config'

export default defineConfig({
  name: 'Acme Admin',
  themeColor: '#0d9488',
  backgroundColor: '#ffffff',
})
```

## The name

`name` names the app; `PROTOBASE_APP_NAME`, when a deployment sets it, overrides it, so a deployment can rename an app without a new build. Without either the app is called `Protobase`.

The app's name titles the sign-in page, such as "Sign in to Acme Admin", the browser tab and the API docs, and the page shown before the app has users speaks of the app rather than of Protobase. An app with a name of its own but no icon shows its initial where the icon would be, in the sidebar and on the sign-in page, and the neutral mark below in the tab and as the installed app's icon.

## The icons

`protobase.favicon.svg` is the one source of the app's icon: the tab shows it, the [web manifest](/reference/installable-app/#the-manifest) names it, and with it the sidebar's logo draws it in place of Protobase's mark, beside the app's name. A project's own [`shell.logo`](/reference/custom-components/#shell-slots) still wins.

Some platforms take no SVG, so a project may put PNGs of the same icon beside it, each square at its size:

| File | Size | Used by |
| --- | --- | --- |
| `protobase.apple-touch-icon.png` | 180 × 180 | the iPhone and iPad home screen, linked by the app's page |
| `protobase.icon-192.png` | 192 × 192 | the web manifest, for Android launchers |
| `protobase.icon-512.png` | 512 × 512 | the web manifest, for Android's install screens |
| `protobase.icon-maskable.png` | 512 × 512 | the web manifest's maskable icon, which Android crops to its own shape: keep the mark within the middle 80% |

The app answers `/favicon.ico`, which browsers and favicon services ask for when they have not read the page, with its icon: the 192 pixel PNG, else the touch icon, else the 512 pixel PNG, else the SVG, each with its own content type. Without a favicon of its own the app answers a neutral mark, a plain rounded square in no brand's colours, which the tab and the installed app show too.

Each is optional, and none is made from the SVG: without the touch icon an iPhone's home screen shows a picture of the page. `protobase build` copies the ones the project has to the bundle's `public/`, and fails on a file that is no PNG or not its size; `protobase dev` serves them from the project's root.

## The colours

Each takes any CSS colour, and the web manifest carries the ones set:

- `themeColor`: the installed app's title bar and the browser's toolbar around it (`theme_color`).
- `backgroundColor`: the screen the installed app shows while it starts (`background_color`), and the background of the [mobile app's own icon](/guides/mobile-app/#the-icon).

The app's own colours, its buttons and surfaces, are the [theme](/reference/theme/)'s.

## Runs on Protobase note

A host can have the sign-in page end on one small line, "Runs on Protobase", below the sign-in card, which links to protobase.net. It is plain, muted text in the app's own font, and the note shows on the sign-in page only: not in dialogs, and not inside the app after signing in.

The host turns it on with `PROTOBASE_RUNS_ON_NOTE=true` where the app runs; without it, as self-hosted apps have it by default, there is no note. It is no option of `protobase.config.ts`, so it is the host's to set. The variable takes only `true` or `false`; any other value stops the app at startup, with an error naming the variable.
