#!/usr/bin/env bash
# Checks the app in the current directory as a deploy does, each step in a log group of its own, and stops at the first
# that fails, naming it: the install from the lockfile, the app's typecheck and tests, `protobase build`, then on a
# fresh Postgres of its own the app's migrations, the auth schema's migration and `protobase doctor`, which runs the
# server's startup checks too. Every protobase command is the app's own installed CLI.
set -Eeuo pipefail

# The Postgres major Protobase is tested on.
postgres_image=postgres:18
step=''

begin() {
  if [ -n "$step" ]; then echo '::endgroup::'; fi
  step=$1
  echo "::group::$step"
}

failed() {
  echo '::endgroup::'
  echo "::error title=Protobase check failed::$step failed. See the $step group in the job log."
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "failed=$step" >> "$GITHUB_OUTPUT"; fi
}
trap failed ERR

has_script() { jq -e --arg name "$1" '.scripts[$name] // empty' package.json > /dev/null; }

protobase() { bun ./node_modules/.bin/protobase "$@"; }

# The app's own script when it has one; a check it has no script for is skipped, saying so.
run_script() {
  begin "$1"
  if has_script "$2"; then
    bun run "$2"
  else
    echo "::notice title=Protobase check::$1 skipped: the project has no $2 script."
  fi
}

# Every platform's packages, so the build finds the linux x64 and arm64 binaries of native add-ons such as sharp's.
begin 'Install'
bun install --frozen-lockfile --os='*' --cpu='*'
if [ ! -e node_modules/.bin/protobase ]; then
  echo 'The app does not install @protobase/cli, whose protobase command every check runs.'
  false
fi

run_script 'Typecheck' typecheck
run_script 'Tests' test

begin 'Build'
protobase build

# A database of its own, provisioned as a hosted app's is: a role that is no superuser and may only create in its own
# database, so a migration that needs more fails here as it would on deploy.
begin 'Start Postgres'
container="protobase-check-$(openssl rand -hex 6)"
password=$(openssl rand -hex 16)
echo "::add-mask::$password"
trap 'docker rm -f "$container" > /dev/null 2>&1 || true' EXIT
docker run -d --name "$container" -e POSTGRES_PASSWORD="$password" -p 127.0.0.1::5432 "$postgres_image" > /dev/null
# The image's first start initialises the data, then restarts the server listening on TCP: wait for that, at most 60 s.
for _ in $(seq 60); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U postgres; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres
psql() { docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }
psql -d postgres <<SQL
create role app with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password '$password';
create database app template template0;
revoke all on database app from public;
grant connect, temporary, create on database app to app;
SQL
psql -d app <<SQL
revoke all on schema public from public;
grant usage, create on schema public to app;
SQL
port=$(docker port "$container" 5432/tcp | head -n 1 | sed 's/.*://')
export DATABASE_URL="postgres://app:$password@127.0.0.1:$port/app"

begin 'Migrations'
if has_script db:migrate; then bun run db:migrate; else protobase migrate; fi

# What the auth store still needs after the app's migrations, applied as the deploy applies it. Sign-in is built only to
# write the file, so it gets stand-ins for the app's URL and secret when the workflow sets none.
begin 'Auth schema migration'
PROTOBASE_URL=${PROTOBASE_URL:-http://localhost} PROTOBASE_SECRET=${PROTOBASE_SECRET:-$(openssl rand -base64 32)} protobase auth migration
protobase migrate

begin 'Doctor'
protobase doctor --env DATABASE_URL
echo '::endgroup::'
