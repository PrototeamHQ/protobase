---
title: Theme
description: protobase.theme.css sets the values of the app's tokens, colors, radius and fonts, for light and dark, and keeps working on every release.
---

A project themes its admin app with one file, `protobase.theme.css` at its root, beside `protobase.config.ts`. It sets the values of the app's tokens, the CSS variables every part of the app and every plugin draws with, for light and for dark, and nothing else:

```css
/* protobase.theme.css */
:root {
  --primary: #0d9488;
  --primary-hover: #0f766e;
  --primary-soft: #f0fdfa;
  --primary-text: #0f766e;
  --radius: 10px;
  --font: Inter, ui-sans-serif, system-ui, sans-serif;
}

[data-theme="dark"] {
  --primary: #2dd4bf;
  --primary-soft: #11302c;
  --primary-text: #5eead4;
}
```

[Theming an app](/guides/theme-an-app/) walks through one.

## Why values only

A stylesheet that reaches into the app with selectors, `.sidebar a` or `button.primary`, depends on the app's markup, which every release may change; it breaks quietly, and only on the screens it touched. A theme that sets token values depends on nothing but the token names, which are a promise like the [plugin API](/reference/plugins/#how-a-plugin-stays-working):

- The app reads every color, its radii and its fonts from these tokens, and so do plugins, whose utilities read them too (`bg-primary` is `background-color: var(--primary)`).
- Tokens are only added. A token that is renamed keeps its old name as well, so a theme never stops applying.
- A token the theme leaves out keeps the app's value, and a value the app no longer reads is ignored, so a theme written for one release works on the next with nothing rebuilt.

Changing how one part of the app looks, beyond its tokens, is not a theme's job: replace that part with a [plugin](/reference/plugins/#extension-points) instead, such as a record card or a field type.

## The file

- **Selectors:** `:root` for the light values, which hold for dark too unless `[data-theme="dark"]` sets its own. Nothing else: no other selector, no nesting, no `@media` or `@import`.
- **Declarations:** tokens only, `--name: value`. Any other property, such as `color` or `font-size`, fails the build.
- **Fonts:** `@font-face` rules are allowed, for a font the theme names in `--font`. Serve its files from wherever you like; a path such as `/fonts/inter.woff2` is the app's origin, which a static host serves from the bundle's `public/` only when the project puts it there.

`protobase build` checks the file, minifies it and writes it to the bundle's `public/protobase.theme.css`, empty when the project has none. A rule it does not allow fails the build, naming the line; a token the app does not read prints a warning, a likely typo, and the build goes on. `protobase dev` serves the file the same way, checked on every request, so an edit shows on the next reload.

## How the app links it

The app's `index.html` links `/protobase.theme.css` after its own stylesheets, so the theme applies before anything draws, the sign-in page included, and needs no request to the API. The app's own token values sit in a cascade layer (`@layer base`) and the theme's in none, so the theme wins whatever order the browser loads them in. Hosts serve the file with `no-cache`, so a new build of the theme shows on the next load.

## Tokens

Every token, with the app's light and dark values. Colors take any CSS color.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#ffffff` | `#0f0f11` |
| `--surface` | `#fafafa` | `#151518` |
| `--muted` | `#f4f4f5` | `#1f1f23` |
| `--border` | `#e4e4e7` | `#27272b` |
| `--border-strong` | `#d4d4d8` | `#3a3a40` |
| `--foreground` | `#18181b` | `#f4f4f5` |
| `--muted-foreground` | `#71717a` | `#a1a1aa` |
| `--faint-foreground` | `#a1a1aa` | `#71717a` |
| `--primary` | `#2563eb` | `#3b82f6` |
| `--primary-hover` | `#1d4ed8` | `#60a5fa` |
| `--primary-foreground` | `#ffffff` | `#ffffff` |
| `--primary-soft` | `#eff6ff` | `#172036` |
| `--primary-border` | `#bfdbfe` | `#1e3a6e` |
| `--primary-text` | `#1d4ed8` | `#93c5fd` |
| `--success` | `#16a34a` | `#22c55e` |
| `--success-soft` | `#f0fdf4` | `#0f2418` |
| `--success-text` | `#15803d` | `#86efac` |
| `--warning` | `#d97706` | `#f59e0b` |
| `--warning-soft` | `#fffbeb` | `#2a1f0a` |
| `--warning-text` | `#b45309` | `#fcd34d` |
| `--danger` | `#dc2626` | `#ef4444` |
| `--danger-soft` | `#fef2f2` | `#2a1214` |
| `--danger-text` | `#b91c1c` | `#fca5a5` |
| `--violet` | `#7c3aed` | `#8b5cf6` |
| `--violet-soft` | `#f5f3ff` | `#20173a` |
| `--violet-text` | `#6d28d9` | `#c4b5fd` |
| `--sidebar` | `#f8f8f9` | `#121215` |
| `--shadow-pop` | `0 8px 24px -4px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.06)` | `0 8px 24px -4px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.4)` |
| `--backdrop` | `#18181b` | `#000000` |
| `--radius` | `6px` | the light value |
| `--font` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | the light value |
| `--font-code` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | the light value |

What they color:

| Tokens | |
| --- | --- |
| `--background`, `--surface`, `--muted`, `--sidebar` | The page, raised surfaces such as cards and table headers, hovered and quiet areas, and the sidebar. |
| `--border`, `--border-strong` | Dividers and card edges, and inputs and buttons. |
| `--foreground`, `--muted-foreground`, `--faint-foreground` | Text: the main, the secondary (help, labels) and the faintest (empty values, placeholders). |
| `--primary` and its group | The main buttons and links (`--primary`, `--primary-hover`, `--primary-foreground` on it), selected and highlighted areas (`--primary-soft`, `--primary-border`) and text in the primary color (`--primary-text`). |
| `--success`, `--warning`, `--danger`, `--violet` and their groups | Statuses and messages: the color itself, a soft background and readable text on it. |
| `--shadow-pop` | The shadow of menus, popovers and the command palette. |
| `--backdrop` | The dim behind dialogs, sheets and the phone drawer, and the shade at a table's edge while it scrolls sideways; drawn see-through, so give it a solid color. |
| `--radius` | The corners: `rounded-md` is `--radius`, `rounded-lg` two pixels more, `rounded-sm` two less and `rounded-xl` six more. |
| `--font`, `--font-code` | The app's text, and identifiers and code. |

The list is `packages/ui/src/tokens.css`, and a test fails when one of its tokens disappears.

## In a plugin

A plugin's utilities read the same tokens, with Tailwind's default as the fallback where an app sets none: `bg-primary` is `var(--primary)`, `rounded-md` is `var(--radius, 6px)` and `font-sans` is `var(--font, ...)`. So a plugin follows the theme of every app that loads it, without knowing it. Write classes such as `bg-primary`, `text-muted-foreground` and `border-border` rather than fixed colors, and the plugin looks at home in light and dark alike.
