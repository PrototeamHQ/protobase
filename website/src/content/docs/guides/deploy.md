---
title: Deploy
description: Ship a project as one bundle folder and run it with the serve runtime, on a host of your own or on Protobase Cloud from a push to GitHub.
---

A project ships as one bundle folder; the host runs protobase around it. An app on Protobase Cloud deploys from a push to its GitHub branch instead, which builds and serves the bundle for it (see [Protobase Cloud](#protobase-cloud)).

```sh
bun run --cwd tests/apps/erp protobase build    # the bundle to ship: tests/apps/erp/dist/
bun run build:serve                     # the runtime the host carries: dist/protobase-serve.js
bun --no-install /opt/protobase/protobase-serve.js /app/protobase.config.js   # on the host: the API
```

Both builds write plain JavaScript that Node and Bun load as it is. For a host that runs Bun, as the images below do, add `--bun` to either: Bun's bundler then writes the final file, the form Bun loads without transpiling, and the build needs `bun` on `PATH` ([details](/reference/cli/#the-config-module)).

The bundle holds three things, more when the project has migrations or the config uses native add-ons:

```
dist/
  protobase.config.js     the config module, run by the serve runtime
  migrations/             only with migrations: the project's db/migrations/*.sql, which `migrate` applies
  node_modules/           only with native add-ons: those packages, with linux x64 and arm64 binaries
  public/                 the admin app (index.html and content-hashed assets/), the project's UI as plugins in
                          plugins/, its theme, protobase.theme.css, and its icons, protobase.favicon.svg
                          and the PNGs the project has
  protobase.bundle.json   the manifest: which paths go to the server, which Protobase version built it, the
                          plugins and the app's version
```

The host serves `public/` itself and sends only the manifest's `api` paths to the runtime (`/api` and the two OAuth discovery documents of [MCP clients](/reference/auth/#oauth-for-mcp-clients)), and `/.well-known/webauthn` for an app on [several origins](/reference/auth/#several-origins), which the manifest does not list, so loading the UI never needs a running container. With the UI it sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, as `protobase serve` does, so no other site frames the app's pages. The runtime serves the API alone; `protobase serve dist` serves the whole folder the same way, to check a bundle locally. The host passes `DATABASE_URL`, `PORT` (default 8787) and optionally `PROTOBASE_DB_CONNECTIONS` (the connections the app may open, so its functions and jobs leave one to requests, see [`serve`](/reference/cli/#serve)), `REQUEST_LOG`, `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM` (the mail server and sender for [password reset](/reference/auth/#password-reset) and emailed sign-in codes) `PROTOBASE_APP_NAME` (the app's name in that mail, see [`name`](/reference/config/app/#name)) `PROTOBASE_SIGN_IN_*` (a provider people with an account sign in with, the [platform sign-in provider](/reference/auth/#platform-sign-in-provider)) `PROTOBASE_OPERATOR_*` (the provider its staff sign in with for [staff sign-in](/reference/auth/#staff-sign-in)), `PROTOBASE_ORIGINS` and `PROTOBASE_PASSKEY_DOMAIN` (the app's [other origins](/reference/auth/#several-origins) and its passkey domain) `PROTOBASE_CORS_ORIGINS` (the websites that may call its API, see [CORS](/reference/api/#cors)), `PROTOBASE_TRUSTED_PROXIES` (the proxies in front of the runtime, whose `X-Forwarded-For` names the client the sign-in limits count, see [Client addresses](/reference/auth/#client-addresses)) and `PROTOBASE_SENTRY_DSN` (the app's [error tracker](/reference/api/#error-reporting)), `PROTOBASE_URL` and `PROTOBASE_SECRET` (the app's address and secret, unless its config sets [`url` and `secret`](/reference/config/app/)), plus the project's own settings, which its config reads where it serves. The runtime and the config module are plain JavaScript for Bun: no install, no TypeScript, no writes. The runtime supplies protobase and the dependencies it runs on the server (`pg`, `postgres`, `kysely`, `better-auth`, ...), so the config module carries only the project's code and the other packages it uses. The manifest's `protobase` is the version the project is pinned to, and the host serves the bundle on the runtime of that version (see [Versioning](/reference/versioning/#bundles-and-runtimes)). The manifest format and the routing rules are in the CLI reference: [`build`](/reference/cli/#build), [`build-serve`](/reference/cli/#build-serve) and [`serve`](/reference/cli/#serve).

## Migrations

Serving never changes the database: the bundle carries the project's `db/migrations` as `migrations/`, and the runtime's `migrate <bundle>` applies the pending ones, the app's and the auth schema's, before a new version serves, with no other writes while it runs. It applies them in one transaction behind a lock, recorded in `public.schema_migrations` as the presets' `db:migrate` does, so a database either script migrated is current for the other. A file that would end that transaction (`BEGIN`, `COMMIT`, `ROLLBACK`) or cannot run in one (`create index concurrently`) is refused, and a refused or failing file leaves the database unchanged. The runtime refuses to start while the auth store has not applied every auth migration of the new version, which it reads from the store's `auth_migrations` table without comparing its tables (see [migrations](/reference/auth/#migrations)). [`protobase migration`](/reference/cli/#migration) writes the files the config's features need, such as the auth and jobs schemas, as the project's own migrations, and [a self-hosted image](#a-self-hosted-image) runs `migrate` as a step of its own before the app starts.

## Images

Every release pushes two public images to GitHub's registry, for `linux/amd64` and `linux/arm64`, tagged with its version:

| Image | What it holds |
| --- | --- |
| `ghcr.io/prototeamhq/protobase:<version>` | the serve runtime, compiled with Bun into `/opt/protobase/protobase-serve`, which serves the API of the bundle mounted at `/app` (and, given the folder, its app too, see [a self-hosted image](#a-self-hosted-image)); the release's prebuilt admin app at `/opt/protobase/shell`, which a host may serve for the bundle's [shell paths](/reference/plugins/#the-shell) instead of the bundle's copy; Bun for its healthcheck on `/health`, and the C++ runtime native add-ons link. It runs as `nonroot` (65532) and writes nothing, so it runs with a read-only root filesystem |
| `ghcr.io/prototeamhq/protobase-dev:<version>` | Bun and the presets at `/opt/protobase/presets/<name>` (`erp`, `real-estate`, `scratch`), with the dependencies they share installed in `/workspace` and Bun's cache in `/opt/bun-cache`. It has no Node: the presets' scripts and the `protobase` command run on Bun. It runs as `bun` (1000) |

```sh
docker run -v "$PWD/dist:/app:ro" -p 127.0.0.1:8787:8787 -e DATABASE_URL -e PROTOBASE_URL -e PROTOBASE_SECRET ghcr.io/prototeamhq/protobase:"$VERSION"   # the version of the @protobase/cli that built dist/
```

In `protobase-dev`, copy a preset into `/workspace` and `bun install --frozen-lockfile` has nothing to do; installed anywhere else, it comes from the cache, without the network.

The Dockerfiles are `docker/protobase/Dockerfile` and `docker/protobase-dev/Dockerfile`. To build them from a clone, at the version in `package.json` (whose `@protobase` packages must be on npm: the serve runtime and the shell come from `@protobase/cli` and `@protobase/ui` installed from npm, and the presets' `bun.lock` files resolve the packages there):

```sh
bun run images:context    # dist/images/protobase and dist/images/protobase-dev
docker build -f docker/protobase/Dockerfile -t protobase dist/images/protobase
docker build -f docker/protobase-dev/Dockerfile -t protobase-dev dist/images/protobase-dev
```

## A self-hosted image

A product built on Protobase ships to self-hosters as one image: the runtime image with the bundle inside. Build the bundle with `protobase build --bun`, then:

```dockerfile
# The runtime of the @protobase/cli version that built dist/: docker build --build-arg VERSION=<that version> .
ARG VERSION
FROM ghcr.io/prototeamhq/protobase:${VERSION}
COPY dist /app
CMD ["/app"]
```

The image runs three commands:

- `/app` serves the admin app and its API.
- `migrate /app` applies the bundle's pending migrations with `DATABASE_URL` alone. It runs none of the app's code.
- `create-admin /app <email>` creates an admin, with `--generate-password` (printed once) or `--password-stdin`. It refuses a schema that is behind.

### Compose template

Two files next to `compose.yaml` hold the settings. `.env`, which compose reads itself:

```sh
APP_VERSION=1.0.0
POSTGRES_PASSWORD=...   # openssl rand -hex 24
APP_DB_PASSWORD=...     # openssl rand -hex 24
```

`app.env`, the app's own settings:

```sh
PROTOBASE_SECRET=...                  # openssl rand -base64 32
PROTOBASE_URL=http://localhost:8787
PROTOBASE_TRUSTED_PROXIES=172.30.87.1
```

`PROTOBASE_URL` is the address the browser opens, exactly: sign-in from `http://127.0.0.1:8787` is refused as another origin. `PROTOBASE_TRUSTED_PROXIES` is the compose network's gateway, which every connection through the published port comes from, a reverse proxy's included; trusting it lets the sign-in limits count each client by the proxy's `X-Forwarded-For` (see [Client addresses](/reference/auth/#client-addresses)). Add the app's other variables to `app.env` too.

```yaml
services:
  postgres:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
      APP_DB_PASSWORD: ${APP_DB_PASSWORD:?set it in .env}
    configs:
      - source: app-database
        target: /docker-entrypoint-initdb.d/app-database.sql
    volumes:
      - db:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-U", "app", "-d", "app"]
      interval: 2s
      retries: 30

  migrate:
    image: ghcr.io/example/my-app:${APP_VERSION:?set it in .env}
    command: ["migrate", "/app"]
    environment:
      DATABASE_URL: postgres://app:${APP_DB_PASSWORD:?set it in .env}@postgres:5432/app
    depends_on:
      postgres:
        condition: service_healthy

  app:
    image: ghcr.io/example/my-app:${APP_VERSION:?set it in .env}
    restart: unless-stopped
    env_file: app.env
    environment:
      DATABASE_URL: postgres://app:${APP_DB_PASSWORD:?set it in .env}@postgres:5432/app
    ports:
      - "127.0.0.1:8787:8787"
    depends_on:
      migrate:
        condition: service_completed_successfully

configs:
  app-database:
    content: |
      \getenv app_password APP_DB_PASSWORD
      create role app login password :'app_password';
      create database app owner app;

volumes:
  db:

networks:
  default:
    ipam:
      config:
        - subnet: 172.30.87.0/24
          gateway: 172.30.87.1
```

`docker compose up -d` starts Postgres, runs `migrate` once and starts the app only when it succeeded. The app and `migrate` connect as `app`, which owns its database but is no superuser (see the [assistant](/reference/assistant/) on why that matters); the superuser's password stays in `.env` and the `postgres` service. Postgres runs the init file only on an empty volume. `configs` with `content` needs a recent Compose v2 (tested with 2.39.4). The network's addresses are fixed so that `app.env` can name its gateway: if `172.30.87.0/24` is taken on the host, `up` stops with "Pool overlaps", so pick another range and change the gateway in `app.env` to match.

### Local only by default

The template publishes the app on `127.0.0.1:8787` only, so only the machine running it can open `http://localhost:8787`, and it speaks plain HTTP. To try it on a remote server, tunnel it with `ssh -L 8787:localhost:8787 <server>` and open `http://localhost:8787` on your own machine.

Before other machines may reach it, put HTTPS in front: a reverse proxy on the host that forwards to `127.0.0.1:8787`, such as Caddy with this Caddyfile, which gets the certificate itself and adds the client's address to `X-Forwarded-For`:

```
app.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Then set `PROTOBASE_URL=https://app.example.com` in `app.env` and run `docker compose up -d` to apply it. Only then are the session cookies `Secure` and passwords and codes encrypted on the way. Another proxy must also append the client's address to `X-Forwarded-For` (see [Client addresses](/reference/auth/#client-addresses)), or every visitor shares one sign-in limit. Do not change the port to `8787:8787`: that publishes plain HTTP on every interface, ahead of host firewall rules such as ufw. On Docker Engine older than 28.0, hosts on the same local network can still reach a port published to `127.0.0.1`, so use 28.0 or newer.

### First admin

```sh
docker compose run --rm --no-deps app create-admin /app you@example.com --generate-password
```

Then open the address in `PROTOBASE_URL` and sign in with that email and the printed password: `https://app.example.com` once the proxy is in front, `http://localhost:8787` (or the SSH tunnel) only while `PROTOBASE_URL` is still `http://localhost:8787`, since sign-in from any other address is refused as another origin. `--no-deps` keeps compose from running `migrate` first, which during an upgrade would migrate under the old version while it serves; use it with every `docker compose run … app`. Where container logs leave the host, pass the password on stdin instead: `docker compose run --rm --no-deps -T app create-admin /app you@example.com --password-stdin < password.txt`.

### Upgrade

```sh
docker compose exec -T postgres pg_dump -U app app > backup.sql
# set APP_VERSION in .env to the new version
docker compose pull
docker compose stop app          # the old version stops, so nothing writes
docker compose run --rm migrate
docker compose up -d
```

Stop any `protobase worker` processes before `migrate` too.

When a migration fails, `migrate` exits with an error and its transaction is rolled back, so the schema is unchanged. Set `APP_VERSION` back and `docker compose start app` brings the old version back on it. A plain `docker compose up -d` with the new version also stops the old one before `migrate`, but after a failure nothing serves until `APP_VERSION` is set back and `up -d` runs again. Going back after a migration that succeeded needs the backup.

## Protobase Cloud

An app on Protobase Cloud whose code is on GitHub follows one branch of its repository, the default branch unless the app was linked to another. A push to that branch deploys it; nothing else does, and a change on another branch, a tag or a pull request deploys nothing.

1. Protobase Cloud builds the branch's newest commit. While a build runs, later pushes wait, and the next build takes the newest commit then, so quick pushes give one build.
2. The build installs the packages with `bun install --frozen-lockfile` and runs `protobase build`. It runs neither the project's typecheck nor its tests.
3. The deploy stops the app's writes, then runs the project's `db:migrate`, the auth schema's migration and `protobase doctor --env DATABASE_URL` in one database transaction, which commits only when all of them pass. Pages keep reading meanwhile; a write, sign-in included, answers that the app is being updated.
4. Writes come back, the new version starts on its own and must answer `/health` with its startup checks, and only then does the app switch to it.

When a step fails, the previous version keeps serving on the database as it was, except after a failed start, which comes after the migrations committed: they stay applied. Each build reports on GitHub as the check run `Protobase deploy` on the commit it built, with the step that failed and the end of its output. A commit whose build failed is not built again: the fix is a new push.

Since the deploy runs neither the typecheck nor the tests, and refuses what `doctor` refuses, check a change before pushing it: the project's typecheck and tests, `protobase doctor --env DATABASE_URL` on a database with the migrations applied, and `protobase build`. The migrations run in one transaction, so a statement Postgres refuses in one, such as `create index concurrently`, fails the deploy. Protobase Cloud also pushes to the branch itself, for an update of the app's Protobase packages, so pull before pushing.

[`protobase skill install`](/reference/cli/#skill) writes the `protobase-cloud` agent skill into the project, with how to check that a change went live and why a deploy failed, step by step.
