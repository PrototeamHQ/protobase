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

The bundle holds three things, four when the config uses native add-ons:

```
dist/
  protobase.config.js     the config module, run by the serve runtime
  node_modules/           only with native add-ons: those packages, with linux x64 and arm64 binaries
  public/                 the admin UI: index.html and content-hashed assets/
  protobase.bundle.json   the manifest: which paths go to the server, which Protobase version built it
```

The host serves `public/` itself and sends only the manifest's `api` paths to the runtime, so loading the UI never needs a running container. The runtime serves the API alone; `protobase serve dist` serves the whole folder the same way, to check a bundle locally. The host passes `DATABASE_URL`, `PORT` (default 8787) and optionally `REQUEST_LOG`, `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM` (the mail server and sender for [password reset](/reference/auth/#password-reset)), plus the project's own settings (`BETTER_AUTH_SECRET`, ...). The runtime and the config module are plain JavaScript for Bun: no install, no TypeScript, no writes. The runtime supplies protobase and the dependencies it runs on the server (`pg`, `postgres`, `kysely`, `better-auth`, ...), so the config module carries only the project's code and the other packages it uses. The runtime serves only bundles built by a compatible Protobase version, below 1.0 the same minor (see [Versioning](/reference/versioning/#bundles-and-runtimes)), so rebuild the bundle when the host's runtime moves to another one. The manifest format and the routing rules are in the CLI reference: [`build`](/reference/cli/#build), [`build-serve`](/reference/cli/#build-serve) and [`serve`](/reference/cli/#serve).
