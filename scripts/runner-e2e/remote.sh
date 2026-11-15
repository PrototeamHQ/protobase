#!/bin/sh
# The runner's end-to-end test on the Linux test machine, run by run.sh in the folder it made, ~/pb-runner-e2e-<stamp>,
# with the branch copied into its repo/. It downloads Bun into the folder, builds the runner, starts one Postgres
# container named for the test, and runs e2e.ts, which builds and runs the custom step's image. On exit, passed or
# failed, it removes that container and its jobs' containers, every image labelled org.protobase.step that it built,
# the base images it pulled, and the folder; an image that was here before stays, labelled or not, and so does
# everything else on the machine. Docker's and Bun's own state stays inside the folder too.
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
E2E=$(dirname "$repo")
case "$(basename "$E2E")" in pb-runner-e2e-[0-9]*) ;; *) echo "remote.sh runs in a folder ~/pb-runner-e2e-<stamp>, not $E2E" >&2; exit 1 ;; esac
[ "$(uname -s)" = Linux ] || { echo "remote.sh runs on the Linux test machine only" >&2; exit 1; }
name=$(basename "$E2E")
postgres_image=postgres:17-alpine
bases="debian:bookworm-slim mwader/static-ffmpeg:7.1.1"
bun_version=1.4.4
# The runner's cleaner image, which the test's job pulls when it is not here
cleaner=busybox@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec

# The Docker CLI's state, Bun's caches and everything else of the test stay in the folder; jobs run under rootless Docker.
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/docker.sock}"
export DOCKER_CONFIG="$E2E/docker-config" BUN_INSTALL="$E2E/bun" BUN_INSTALL_CACHE_DIR="$E2E/bun-cache"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$E2E/bun-cache/transpiler" XDG_CACHE_HOME="$E2E/cache" XDG_CONFIG_HOME="$E2E/config"
export XDG_DATA_HOME="$E2E/data" TMPDIR="$E2E/tmp" DO_NOT_TRACK=1
mkdir -p "$DOCKER_CONFIG" "$BUN_INSTALL" "$BUN_INSTALL_CACHE_DIR" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$TMPDIR"

images_before=$(docker image ls --format '{{.Repository}}:{{.Tag}}')
step_images_before=$(docker image ls -q --filter label=org.protobase.step)
containers_before=$(docker ps -a --format '{{.Names}}')
cleaner_before=$(docker image inspect "$cleaner" >/dev/null 2>&1 && echo here || echo none)
was_here() { printf '%s\n' "$images_before" | grep -qxF "$1"; }
echo "== before: cleaner image $cleaner_before, images [$(printf '%s' "$images_before" | tr '\n' ' ')], containers [$(printf '%s' "$containers_before" | tr '\n' ' ')]"

cleanup() {
  status=$?
  set +e
  # run.sh may be gone, its ssh with it: the cleanup goes on without anyone to print to.
  trap '' PIPE HUP
  echo "== cleaning up (exit $status)"
  [ -f "$E2E/runner.pid" ] && kill "$(cat "$E2E/runner.pid")" 2>/dev/null
  app_key=$(cat "$E2E/app-key" 2>/dev/null)
  docker rm -f "$name" >/dev/null 2>&1
  # Only the containers of this test's own jobs, never another runner's on the machine
  if [ -f "$E2E/jobs" ]; then
    for job in $(cat "$E2E/jobs"); do docker rm -f "protobase-job-$job" "protobase-clean-$job" >/dev/null 2>&1; done
  fi
  # A job's container's user may have left files the runner's user cannot remove: the base image's root removes them.
  if ! rm -rf "$E2E" 2>/dev/null && docker image inspect debian:bookworm-slim >/dev/null 2>&1; then
    docker run --rm --network none --user 0:0 -v "$E2E:/e2e" debian:bookworm-slim sh -c 'rm -rf /e2e/* /e2e/.[!.]*'
    rm -rf "$E2E"
  fi
  # The step images of this test's app only, and of those none that was here before
  if [ -n "$app_key" ]; then
    for image in $(docker image ls -q --filter label=org.protobase.step --filter "label=org.protobase.app=$app_key"); do
      printf '%s\n' "$step_images_before" | grep -qxF "$image" || docker image rm -f "$image" >/dev/null
    done
  fi
  [ "$cleaner_before" = here ] || docker image rm "$cleaner" >/dev/null 2>&1
  for image in $postgres_image $bases; do
    was_here "$image" || docker image rm "$image" >/dev/null 2>&1
  done
  rm -rf "$E2E"
  echo "== cleaned up"
  exit $status
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

seconds() { echo "$(( $(date +%s) - $1 )) s"; }

echo "== Bun $bun_version"
mkdir -p "$E2E/bun/dl"
curl -fsSL "https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-$bun_version.tgz" | tar -xz -C "$E2E/bun/dl"
export PATH="$E2E/bun/dl/package/bin:$PATH"
bun --version

echo "== bun install"
start=$(date +%s)
(cd "$repo" && bun install --frozen-lockfile --ignore-scripts >"$E2E/install.log" 2>&1) || { tail -40 "$E2E/install.log"; exit 1; }
echo "installed in $(seconds "$start")"

echo "== bun run runner:build"
start=$(date +%s)
(cd "$repo" && bun run runner:build)
echo "built in $(seconds "$start")"
ls -la "$repo/packages/runner/dist"
"$repo/packages/runner/dist/protobase-runner-linux-x64" version

echo "== pulls"
for image in $postgres_image $bases; do
  if was_here "$image"; then echo "$image was here"; continue; fi
  start=$(date +%s)
  docker pull -q "$image" >/dev/null
  echo "pulled $image in $(seconds "$start")"
done

echo "== Postgres"
# A free port, never 5291, which another use of the machine keeps
port=$(python3 -c 'import socket
while True:
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    if port != 5291: print(port); break')
docker run -d --name "$name" --label "org.protobase.e2e=$name" -e POSTGRES_USER=protobase -e POSTGRES_PASSWORD=e2e -p "127.0.0.1:$port:5432" "$postgres_image" >/dev/null
for _ in $(seq 60); do docker exec "$name" pg_isready -U protobase -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
echo "Postgres on 127.0.0.1:$port"

echo "== e2e"
cd "$repo"
E2E_DIR="$E2E" E2E_DATABASE_URL="postgres://protobase:e2e@127.0.0.1:$port/postgres" E2E_RUNNER="$repo/packages/runner/dist/protobase-runner-linux-x64" bun scripts/runner-e2e/e2e.ts
