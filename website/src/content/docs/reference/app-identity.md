---
title: App identity
description: The app's name, icon and colours, which its sidebar logo, browser tabs, home-screen icon, web manifest and mail all follow.
---

An app looks like its own everywhere from three things in its project: its name, its icon and its colours. The sidebar's logo, the browser tab, the icon on a phone's home screen, the [installed app](/reference/installable-app/) and the auth mail all follow them, with no component to write.

| What | Where | Used by |
| --- | --- | --- |
| Name | `appName` of `createAuth` ([auth configuration](/reference/auth/#configuration)), overridden at run time by `PROTOBASE_APP_NAME` | the sidebar's logo, the end of every tab title, the installed app's name, the [mobile app](/guides/mobile-app/)'s name on the phone, passkey and authenticator prompts, auth mail and its sender's name |
| Icon | `protobase.favicon.svg` at the project's root | the browser tab, the sidebar's logo, the installed app's icon |
| Raster icons | optional PNGs beside the SVG, below | the iPhone home screen and Android launchers, which take no SVG |
| Colours | `app` in `protobase.config.ts` | the installed app's title bar and its start screen |

```ts
// protobase.config.ts
export default defineConfig({
  config,
  auth,
  authenticate,
  app: { themeColor: '#0d9488', backgroundColor: '#ffffff' },
})
```

`createAuth` takes the name because the sign-in it builds needs it, so keep the name in a constant both `auth/auth.ts` and anything else that shows it import, if you want it written once.

## The name

`appName` names the app; `PROTOBASE_APP_NAME`, when a deployment sets it, overrides it, so a deployment can rename an app without a new build. Without either the app is called `Protobase`.

## The icons

`protobase.favicon.svg` is the one source of the app's icon: the tab shows it, the [web manifest](/reference/installable-app/#the-manifest) names it, and with it the sidebar's logo draws it beside the app's name in place of Protobase's mark and wordmark. A project's own [`shell.logo`](/reference/custom-components/#shell-slots) still wins.

Some platforms take no SVG, so a project may put PNGs of the same icon beside it, each square at its size:

| File | Size | Used by |
| --- | --- | --- |
| `protobase.apple-touch-icon.png` | 180 × 180 | the iPhone and iPad home screen, linked by the app's page |
| `protobase.icon-192.png` | 192 × 192 | the web manifest, for Android launchers |
| `protobase.icon-512.png` | 512 × 512 | the web manifest, for Android's install screens |
| `protobase.icon-maskable.png` | 512 × 512 | the web manifest's maskable icon, which Android crops to its own shape: keep the mark within the middle 80% |

Each is optional, and none is made from the SVG: without the touch icon an iPhone's home screen shows a picture of the page. `protobase build` copies the ones the project has to the bundle's `public/`, and fails on a file that is no PNG or not its size; `protobase dev` serves them from the project's root.

## The colours

`app` takes any CSS colour for each, and the web manifest carries the ones set:

- `themeColor`: the installed app's title bar and the browser's toolbar around it (`theme_color`).
- `backgroundColor`: the screen the installed app shows while it starts (`background_color`).

The app's own colours, its buttons and surfaces, are the [theme](/reference/theme/)'s.
