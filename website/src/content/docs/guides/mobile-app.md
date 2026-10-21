---
title: A mobile app
description: Run a Protobase app on iOS and Android and build signed store releases from a mobile section in its config, without setting up Capacitor yourself.
---

A Protobase app runs as an iOS or Android app with nothing more than a `mobile` section in its `protobase.config.ts`. `protobase mobile` wraps the app in [Capacitor](https://capacitorjs.com): the app's shell, its UI plugins, theme and favicon open from files on the device, and the app calls your server's API.

Signing in from the app is not supported yet: until then the app shows that it cannot reach the server's sign-in, while its API calls go through.

## 1. Install the tools

- **iOS**, on a Mac: Xcode, with a simulator.
- **Android**: the Android SDK, with an emulator, and JDK 21.

Set their variables, such as `ANDROID_HOME` and `JAVA_HOME`, in your shell, not in the project's `.env`: the commands hand npm and Capacitor no variable named in any of the project's `.env*` files, even when the shell sets a variable of the same name, since those files hold the app's secrets.

## 2. Add a mobile section

```ts
// protobase.config.ts
export default defineConfig({
  // ...
  mobile: {
    appId: 'com.example.shop',
    plugins: { '@capacitor/camera': '^8.0.0' },
  },
})
```

- `appId` is the app's id in reverse-DNS form: at least two parts separated by dots, each starting with a letter and holding only letters, digits and underscores.
- `plugins`, optional, are extra native [Capacitor plugins](https://capacitorjs.com/docs/plugins), npm name to version. Capacitor itself, `@capacitor/app`, `@capacitor/splash-screen` and `@capawesome/capacitor-live-update` come with Protobase at fixed versions and cannot be listed. A plugin runs native code with the app's rights, and one that writes files, such as `@capacitor/filesystem`, lets a script that got into the page point the app at files it wrote (with Capacitor's own `WebView.setServerBasePath`), so list only plugins the app needs.

With a mobile section, the API answers the app's origins, `capacitor://localhost` on iOS and `https://localhost` on Android, through [CORS](/reference/api/#cors). Apps without one get no new dependency, and `protobase build` and `protobase dev` work as before.

## 3. Run it

```sh
protobase mobile run android
protobase mobile run ios
```

The first run installs Capacitor into `.protobase/mobile/`, which ignores itself in git. Every run builds the app's files as [`protobase build`](/reference/cli/#build) does and generates the native project from your config again, so never edit the projects in `.protobase/mobile/` by hand. Your own package.json gains nothing.

The app calls the server at the project's auth `baseURL`; pass `--api https://shop.example.com` for another one. Plain http is only for a server on this machine (`localhost`) or, on the Android emulator, its host `10.0.2.2`; any other server needs https. An Android phone on USB reaches a server on `localhost` through a forwarded port; an iPhone needs an https server. The app's UI plugins load from the device only when the server serves a built bundle (`protobase serve dist`): against `protobase dev`, use `--live`.

`--target <id>` picks the simulator, emulator or device; without it Capacitor asks.

## 4. Live reload

```sh
protobase dev
protobase mobile run android --live
```

With `--live` the app opens the running `protobase dev` instead of its own files, so it reloads as you save. `--port` names the dev server's port, 5173 by default.

## 5. Open the native project

```sh
protobase mobile open ios
```

opens the generated project in Xcode, or Android Studio for `android`. To run on an iPhone, pick a signing team in Xcode's Signing & Capabilities.

## 6. Build a release

```sh
protobase mobile build android --app-version 1.2.3 --build-number 7 --api https://shop.example.com
protobase mobile build ios --app-version 1.2.3 --build-number 7 --api https://shop.example.com --team ABCDE12345
```

makes a signed release binary: an `.aab` to upload to Google Play, an `.ipa` to upload to App Store Connect. It goes to `mobile-release/`, which ignores itself in git, named `<appId>-<version>-<build number>`; `--out <dir>` picks another folder.

- The binary carries the app's files, so it opens without a network and never downloads anything on its first launch; offline it says it cannot reach the server, as the web app does.
- A release calls its server over https, at `--api` or the project's auth `baseURL`: plain http, `localhost` and `10.0.2.2` are refused.
- `--app-version` is the version the stores show, one to three numbers such as `1.2.3`. `--build-number` is a whole number that must rise with every upload, such as your CI's run number.
- Extra plugins run at build time with access to your signing key, so add only plugins you trust.

**Android.** Make an upload key once, outside the project, and never commit it:

```sh
keytool -genkeypair -v -keystore ~/.android-keys/upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Use it as the upload key with Play App Signing. Set these variables in your shell or as CI secrets, never as command arguments, where other users of the machine can read them:

- `PROTOBASE_ANDROID_KEYSTORE`: the keystore file, absolute or relative to the project folder.
- `PROTOBASE_ANDROID_KEYSTORE_PASSWORD` and `PROTOBASE_ANDROID_KEY_PASSWORD`: its passwords.
- `PROTOBASE_ANDROID_KEY_ALIAS`: the key's alias, `upload` above.

Only Gradle gets them, for the length of the build: npm, its install scripts and Capacitor never do. The build needs the Android SDK and JDK 21.

**iOS**, on a Mac with Xcode: `--team` is your Apple Developer team id, shown in your account's membership details. Xcode signs with the certificates and profiles of the account you added in its settings. For manual signing, pass `--certificate <name>` and `--profile <name>` too. If automatic signing finds no profile for a new app, run `protobase mobile open ios`, pick the team in Signing & Capabilities and archive once from Xcode (Product, Archive), which creates the profile; then build again.

## 7. What the stores accept

You submit the app under your own developer account, on both stores: Apple rejects apps from a template or app generation service unless the provider of the app's content submits them ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) 4.2.6).

- **What may change without a store release:** the app's files, which a later Protobase release can update over the air: the shell, UI plugins, theme, in-app logo and copy, and fixes and features within the app's purpose. Apple allows downloaded interpreted code that does not change the app's primary purpose ([Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) 3.3.1(B)), and Google Play allows JavaScript in a WebView ([Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379)).
- **What needs a store release:** native code, Capacitor or plugin changes (`mobile.plugins`), permissions, the app's name, its home-screen icon and its splash screen.
- **Big new features** still go through Apple's review with a store release, even when they could ship over the air: Apple asks that an app's features be documented and reviewed, none hidden (App Review Guidelines 2.3.1 and 2.5.19).
- **A plain WebView of an admin app risks rejection:** Apple expects an app to be more than a repackaged website (4.2). Native touches help, such as push notifications, sharing, the camera or biometric sign-in, through `mobile.plugins`.
