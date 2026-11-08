#!/usr/bin/env bash
# Upgrades tests/upgrade/app from the Protobase of one checkout to this checkout's, as an app upgrades, and fails when a
# migration fails or `protobase doctor` then reports an error. The app is seeded on the empty database DATABASE_URL names
# with the first checkout's CLI, from that checkout's copy of the app when it has one, then takes this checkout's copy of
# the app and is upgraded with this checkout's CLI. Each checkout needs its dependencies installed.
#
#   DATABASE_URL=postgres://... tests/upgrade/upgrade.sh <checkout of the version to upgrade from>
set -euo pipefail

from=$(cd "$1" && pwd)
to=$(cd "$(dirname "$0")/../.." && pwd)
: "${DATABASE_URL:?set DATABASE_URL to an empty database}"
# A throwaway secret: sign-in needs one to load, and nothing signs in.
PROTOBASE_SECRET=$(openssl rand -base64 32)
export DATABASE_URL PROTOBASE_SECRET

app=$(mktemp -d)
trap 'rm -rf "$app"' EXIT

# The app's own migrations first, then the auth schema, which the other features' tables point at, then every feature's,
# each applied before the next is written, since each is written compared with the database.
upgrade() {
  local cli=$1/packages/cli/bin/protobase-source.mjs
  (
    cd "$app"
    bun "$cli" migrate
    bun "$cli" auth migration
    bun "$cli" migrate
    bun "$cli" migration
    bun "$cli" migrate
  )
}

seed=$from/tests/upgrade/app
if [ ! -d "$seed" ]; then seed=$to/tests/upgrade/app; fi
cp -R "$seed/." "$app"
echo "Seeding the app with the Protobase of $(git -C "$from" rev-parse --short HEAD)"
upgrade "$from"

# The migrations the seeding wrote stay, as an app keeps those it committed.
cp -R "$to/tests/upgrade/app/." "$app"
echo "Upgrading the app to the Protobase of $(git -C "$to" rev-parse --short HEAD)"
upgrade "$to"
(cd "$app" && bun "$to/packages/cli/bin/protobase-source.mjs" doctor)
