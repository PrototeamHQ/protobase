---
title: Deploy
description: Ship a project as one bundle folder and run it with the serve runtime.
---

A project ships as one bundle folder; the host runs protobase around it.

```sh
pnpm --filter erp protobase build    # the bundle to ship: examples/erp/dist/
pnpm build:serve                     # the runtime the host carries: dist/protobase-serve.js
bun --no-install /opt/protobase/protobase-serve.js /app/protobase.config.js   # on the host: the API
```

Both builds write plain JavaScript that Node and Bun load as it is. For a host that runs Bun, as the images below do, add `--bun` to either: Bun's bundler then writes the final file, the form Bun loads without transpiling, and the build needs `bun` on `PATH` ([details](/reference/cli/#the-config-module)).

The bundle holds three things, four when the config uses native add-ons:

```
dist/
  protobase.config.js     the config module, run by the serve runtime
  node_modules/           only with native add-ons: those packages, with linux x64 and arm64 binaries
  public/                 the admin UI: index.html and content-hashed assets/
  protobase.bundle.json   the manifest: which paths go to the server, which Protobase version built it
```

The host serves `public/` itself and sends only the manifest's `api` paths to the runtime, so loading the UI never needs a running container. The runtime serves the API alone; `protobase serve dist` serves the whole folder the same way, to check a bundle locally. The host passes `DATABASE_URL`, `PORT` (default 8787) and optionally `REQUEST_LOG`, `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM` (the mail server and sender for [password reset](/reference/auth/#password-reset)), plus the project's own settings (`BETTER_AUTH_SECRET`, ...). The runtime and the config module are plain JavaScript for Bun: no install, no TypeScript, no writes. The runtime supplies protobase and the dependencies it runs on the server (`pg`, `postgres`, `kysely`, `better-auth`, ...), so the config module carries only the project's code and the other packages it uses. The runtime serves only bundles built by a compatible Protobase version, below 1.0 the same minor (see [Versioning](/reference/versioning/#bundles-and-runtimes)), so rebuild the bundle when the host's runtime moves to another one. The manifest format and the routing rules are in the CLI reference: [`build`](/reference/cli/#build), [`build-serve`](/reference/cli/#build-serve) and [`serve`](/reference/cli/#serve).

## Images

Every release pushes two public images to GitHub's registry, for `linux/amd64` and `linux/arm64`, tagged with its version:

| Image | What it holds |
| --- | --- |
| `ghcr.io/prototeamhq/protobase:<version>` | the serve runtime, compiled with Bun into `/opt/protobase/protobase-serve`, which serves the API of the bundle mounted at `/app`; Bun for its healthcheck on `/health`, and the C++ runtime native add-ons link. It runs as `nonroot` (65532) and writes nothing, so it runs with a read-only root filesystem |
| `ghcr.io/prototeamhq/protobase-dev:<version>` | Bun and the presets at `/opt/protobase/presets/<name>` (`erp`, `real-estate`, `scratch`), with the dependencies they share installed in `/workspace` and Bun's cache in `/opt/bun-cache`. It has no Node: the presets' scripts and the `protobase` command run on Bun. It runs as `bun` (1000) |

```sh
docker run -v "$PWD/dist:/app:ro" -p 8787:8787 -e DATABASE_URL -e BETTER_AUTH_SECRET ghcr.io/prototeamhq/protobase:0.2.0
```

In `protobase-dev`, copy a preset into `/workspace` and `bun install --frozen-lockfile` has nothing to do; installed anywhere else, it comes from the cache, without the network.

The Dockerfiles are `docker/protobase/Dockerfile` and `docker/protobase-dev/Dockerfile`. To build them from a clone, at the version in `package.json` (whose `@protobase` packages must be on npm, since the presets' `bun.lock` files resolve them there):

```sh
pnpm images:context    # dist/images/protobase and dist/images/protobase-dev
docker build -f docker/protobase/Dockerfile -t protobase dist/images/protobase
docker build -f docker/protobase-dev/Dockerfile -t protobase-dev dist/images/protobase-dev
```
