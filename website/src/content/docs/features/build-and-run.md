---
title: Build and run
description: Develop, build and run an app, on servers, in containers and on phones.
---

- [Node and Bun](/reference/cli/#how-it-runs): The `protobase` command runs on Node 22.12 or later or on Bun, and a bundle runs on both unless it is built for Bun only.
- [Dev server](/reference/cli/#dev): The admin app and the API on one port, with changes shown without a restart.
- [Editor types](/reference/cli/#types): `protobase types` gives the editor and `tsc` the types of the CLI that builds the app, with nothing installed.
- [Project scripts](/reference/cli/#run): `protobase run` runs a seed or a migration script on the CLI's packages.
- [Migrate command](/reference/cli/#migrate): `protobase migrate` applies the project's SQL migrations in one transaction, with nothing installed.
- [Migrations from config](/reference/cli/#migration): Writes the SQL migrations for what the config turns on, as files of the project.
- [User and organization commands](/reference/cli/#users): Create users, set roles and manage organizations from the terminal.
- [Encryption commands](/reference/cli/#encryption-status): Report and fix plaintext or old-key values of encrypted fields.
- [One bundle](/reference/cli/#build): `protobase build` writes one folder with everything the app needs, without a database or secrets. It fails on a view that filters, sorts or searches by a field its resource does not allow.
- [Source maps](/reference/cli/#source-maps): The bundle and plugins can carry source maps with debug ids, for an error tracker to read browser stack frames.
- [Extensions](/reference/cli/#extensions): A host adds its own tools and widgets to every app it builds.
- [Native packages](/reference/cli/#native-packages): npm packages with native add-ons are bundled for Linux.
- [Serve runtime](/reference/cli/#serve): Runs a bundle, set by environment variables, with a health check, startup checks, jobs and a clean shutdown.
- [Migrations at update time](/guides/deploy/#migrations): The bundle carries the project's migrations, and the runtime applies them in one transaction before the new version serves.
- [Single-file runtime](/reference/cli/#build-serve): The runtime as one file, so a host needs only Bun and that file.
- [Separate worker](/reference/cli/#worker): Jobs and event delivery in their own process.
- [Container images](/guides/deploy/#images): A runtime image for each release, for amd64 and arm64.
- [Self-hosted image](/guides/deploy/#a-self-hosted-image): One image with the app inside that serves, migrates and creates the first admin.
- [Protobase Cloud deploys](/guides/deploy/#protobase-cloud): A push to the app's GitHub branch builds it, migrates and checks its database in one transaction, and switches to the new version once it answers its health check.
- [Mobile apps](/guides/mobile-app/) (beta): Runs an app on iOS and Android, also on your own iPhone, with sign-in, and builds signed store releases from a section in its config.
- [Mobile releases](/reference/cli/#mobile-releases) (in development): The server offers the mobile app a newer copy of its files, signed, and any host that serves bundles can offer the same from the bundle's files without running its config.
- [Live updates](/reference/cli/#the-live-updater) (in development): The Android app updates itself in the background to the server's release, downloading only the files that changed, and goes back to the files it was built with when a release fails to start.
