---
title: Theming an app
description: Give an app its own colors, corners and font with protobase.theme.css, in light and dark, and keep them through every release.
---

Rijnland Industrial Supply wants its admin in its own colors: teal instead of blue, rounder corners and its own font. That is one file of values, `protobase.theme.css`, which the app reads on every page, the sign-in page included. This guide writes it for the ERP example (`tests/apps/erp`); any project works the same. [Theme](/reference/theme/) has every token.

## 1. The light values

Create `protobase.theme.css` at the project root, beside `protobase.config.ts`, and set the tokens you want to change under `:root`:

```css
/* protobase.theme.css */
:root {
  --primary: #0d9488;
  --primary-hover: #0f766e;
  --primary-soft: #f0fdfa;
  --primary-border: #99f6e4;
  --primary-text: #0f766e;
  --sidebar: #f5faf9;
}
```

The primary group goes together: the color of buttons and the selected item, its hover, a soft background for selected rows, a border for those, and the color of text and links. Start `bun run protobase dev` and sign in: the buttons, links, the sidebar's selected item and the chart are teal. Every other token keeps the app's value.

Only values are allowed. A selector such as `.sidebar`, or a property such as `color`, fails the build, naming the line it is on, and `protobase dev` answers the theme with that error and draws the app without it; the [file's rules](/reference/theme/#the-file) say why. To change how one part looks beyond its tokens, replace it with a plugin, such as a [record card](/guides/record-card/).

## 2. Corners and font

```css
:root {
  /* ... */
  --radius: 10px;
  --font: Georgia, "Times New Roman", serif;
}
```

`--radius` sets every rounded corner: buttons, inputs and menus take it, cards two pixels more. `--font` is the app's text, and `--font-code` the font of identifiers and code. Reload: the app is rounder and set in Georgia.

A font the browser does not have comes with an `@font-face` rule in the same file, its files served by the app, a CDN or a font service:

```css
@font-face {
  font-family: Inter;
  src: url(https://fonts.example.com/inter-var.woff2) format("woff2");
  font-weight: 100 900;
}

:root {
  --font: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

## 3. Dark

The app draws in light or dark as each user chooses in the profile menu, and follows their system until they choose ([Light, dark or the system](/reference/theme/#light-dark-or-the-system)). Values under `:root` hold for both, so teal on white is also teal on near-black. Give dark its own where it needs them, under `[data-theme="dark"]`:

```css
[data-theme="dark"] {
  --primary: #2dd4bf;
  --primary-hover: #5eead4;
  --primary-foreground: #042f2e;
  --primary-soft: #11302c;
  --primary-text: #5eead4;
}
```

A light teal needs dark text on it, so the button's text, `--primary-foreground`, turns near-black here. A soft background from `:root` would glare on the dark page, so `--primary-soft` gets a dark one too. Pick "Dark" in the profile menu to check each screen, the sign-in page included.

## 4. Build and ship

```sh
bun run protobase build
```

The build checks the theme as `protobase dev` does, minifies it, and writes it to `dist/public/protobase.theme.css`, which the app links after its own stylesheets. A token the app does not read is printed as a warning, since it is most likely a typo:

```
warning: protobase.theme.css:1: --primry is not a token the app reads; check its name
```

Ship the bundle as before. The theme is a file of the bundle like the others, so a static host serves it, with `no-cache` so a change shows on the next load.

## When the app moves on

The theme holds no selectors into the app, only the values of tokens, and releases only ever add tokens. So it applies the same way after every update, and a token that is added later keeps the app's value until the theme sets it. Plugins follow it too: their `bg-primary` and `rounded-md` read the same tokens, so the sales team's [plugins](/reference/plugins/) are teal and round in this app, and blue and square in another.
