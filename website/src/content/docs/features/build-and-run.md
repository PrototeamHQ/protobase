---
title: Build and run
description: Develop, build and run an app, on servers, in containers and on phones.
---

- [Dev server](/reference/cli/#dev): The admin app and the API on one port, with changes shown without a restart.
- [Migrations from config](/reference/cli/#migration): Writes the SQL migrations for what the config turns on, as files of the project.
- [User and organization commands](/reference/cli/#users): Create users, set roles and manage organizations from the terminal.
- [Encryption commands](/reference/cli/#encryption-status): Report and fix plaintext or old-key values of encrypted fields.
- [One bundle](/reference/cli/#build): `protobase build` writes one folder with everything the app needs, without a database or secrets.
- [Extensions](/reference/cli/#extensions): A host adds its own tools and widgets to every app it builds.
- [Native packages](/reference/cli/#native-packages): npm packages with native add-ons are bundled for Linux.
- [Serve runtime](/reference/cli/#serve): Runs a bundle, with a health check, startup checks, jobs and a clean shutdown.
- [Single-file runtime](/reference/cli/#build-serve): The runtime as one file, so a host needs only Bun and that file.
- [Separate worker](/reference/cli/#worker): Jobs and event delivery in their own process.
- [Container images](/guides/deploy/#images): A runtime image for each release, for amd64 and arm64.
- [Self-hosted image](/guides/deploy/#a-self-hosted-image): One image with the app inside that serves, migrates and creates the first admin.
- [Mobile apps](/guides/mobile-app/) (beta): Runs an app on iOS and Android, with sign-in, and builds signed store releases from a section in its config.
