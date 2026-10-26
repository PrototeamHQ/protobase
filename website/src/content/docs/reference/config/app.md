---
title: App options
description: The config keys of the app itself, its name, public URL, secret, language, time zone, install colours and mobile build, with their types, defaults and environment variables.
---

The keys of the app itself, at the top level of [`protobase.config.ts`](/reference/config/).

## name

- **Type:** `string`
- **Default:** `Protobase`
- **Environment variable:** `PROTOBASE_APP_NAME`, which overrides it

The app's name: sign-in prompts and passkeys show it, the mail it sends names the app with it and is sent as it, and the sidebar, the browser tabs and the [installed app](/reference/installable-app/) are called by it. A deployment renames the app with `PROTOBASE_APP_NAME`, which wins over the config. See [App identity](/reference/app-identity/#the-name).

```ts
export default defineConfig({ name: 'Property Finder' })
```

## url

- **Type:** `string`
- **Default:** `PROTOBASE_URL`; in `protobase dev`, the dev server's own address
- **Environment variable:** `PROTOBASE_URL`

The app's public URL: the issuer and audience of its tokens, and where its emails link to. Sign-in needs it: with `auth` on, `protobase dev`, `serve` and the commands that sign people in stop with a clear message when it is missing. Other origins the app is served on are [`auth.origins`](/reference/config/sign-in/#authorigins).

```ts
export default defineConfig({ url: 'https://admin.example.com' })
```

## secret

- **Type:** `string`
- **Default:** `PROTOBASE_SECRET`
- **Environment variable:** `PROTOBASE_SECRET`

The app's secret, made with `openssl rand -base64 32`: it signs session cookies, upload tickets, download links and public forms' bot checks, and encrypts the token signing keys. Sign-in needs it, and file fields too unless [`files.secret`](/reference/config/files/#filessecret) names another. Keep it out of the config's source and read it from the environment, which the default does.

```ts
export default defineConfig(({ env }) => ({ secret: env.ADMIN_SECRET }))
```

## locale

- **Type:** `'en' | 'nl'`
- **Default:** each user's browser's language, when the screens come in it; English otherwise

The language of the admin app's built-in screens and of its numbers and dates, for every user. Any other value stops the app at start. See [Languages](/reference/languages/).

```ts
export default defineConfig({ locale: 'nl' })
```

## timezone

- **Type:** `string`
- **Default:** `UTC`

The time zone the jobs' schedules are read in, such as `Europe/Amsterdam`, unless a job names its own [`timezone`](/reference/config/jobs-and-events/#jobs). See [Recurring jobs](/reference/jobs/#recurring-jobs).

```ts
export default defineConfig({ timezone: 'Europe/Amsterdam' })
```

## themeColor

- **Type:** `string`, any CSS colour

The colour of the installed app's title bar and of the browser's toolbar around it, the web manifest's `theme_color`. See [App identity](/reference/app-identity/#the-colours).

```ts
export default defineConfig({ themeColor: '#0d9488' })
```

## backgroundColor

- **Type:** `string`, any CSS colour

The colour of the screen the installed app shows while it starts, the web manifest's `background_color`.

```ts
export default defineConfig({ backgroundColor: '#ffffff' })
```

## mobile

- **Type:** `{ appId: string; plugins?: Record<string, string> }`

The app's iOS and Android build: with it, `protobase mobile` builds the app with Capacitor, and the API also allows the app's Capacitor origins (`capacitor://localhost`, `https://localhost`) for [CORS](/reference/config/api/#cors). See [A mobile app](/guides/mobile-app/).

- `appId`: the app's id on both iOS and Android, such as `com.example.shop`: two or more dot-separated parts, each a letter then letters and digits.
- `plugins`: extra native Capacitor plugins, by npm name and version range. A range fetched over plain `http:` or `git:` is refused.

```ts
export default defineConfig({
  mobile: { appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.0' } },
})
```
