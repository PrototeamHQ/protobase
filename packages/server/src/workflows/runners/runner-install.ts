import { Hono } from 'hono'
import { protobaseVersion } from '../../protobase-version'

/** Where each release keeps the runner's executables, `protobase-runner-linux-x64` and `protobase-runner-linux-arm64`. */
export const runnerReleases = 'https://github.com/PrototeamHQ/protobase/releases/download'

// A value as one word of POSIX sh, in single quotes.
const quoted = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

/**
 * Where a runner reaches the app: its address (`origin`) and the path its system endpoints are under (`apiPath`), `/api`
 * unless the app's `basePath` puts them elsewhere, as `/backend` for `/backend/v1`.
 */
export type RunnerApp = { origin: string; apiPath: string }

/** The address of the runners' calls on the app, `<origin><apiPath>/runners/v1`. */
export const runnerEndpoint = ({ origin, apiPath }: RunnerApp) => `${origin}${apiPath}/runners/v1`

/** The one command that installs a runner for the app, registering it with its one-time token. */
export const installCommand = ({ origin, apiPath }: RunnerApp, token: string) => `curl -fsSL ${origin}${apiPath}/runners/install.sh | sh -s -- --token ${token}`

/**
 * The install script, POSIX sh, for the app at `origin` with its endpoints under `apiPath`, of Protobase `version`: it finds the machine's platform,
 * downloads the runner of that version for it (`--binary-url` gives another, such as a file for a test), checks that
 * Docker or Podman works for the user and recommends rootless mode when it is not, registers with the one-time token
 * (`--token`), and writes, enables and starts a systemd user unit running `protobase-runner run` (`--service false`
 * leaves that to the user). The runner's settings pass on to `register`.
 */
export const installScript = ({ origin, apiPath }: RunnerApp, version: string) => `#!/bin/sh
# Installs a Protobase runner for ${origin}: ${installCommand({ origin, apiPath }, 'pbr_once_...')}
set -eu

url=${quoted(origin)}
api_path=${quoted(apiPath)}
version=${quoted(version)}
token=''
binary_url=''
bin_dir="\${HOME}/.local/bin"
service=true
settings=''

fail() {
  echo "protobase-runner install: $*" >&2
  exit 1
}

# A value as one word of sh, for the settings passed on to register.
word() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\\\\\''/g")"
}

while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || fail "$1 needs a value"
  case "$1" in
    --token) token=$2 ;;
    --url) url=$2 ;;
    --api-path) api_path=$2 ;;
    --binary-url) binary_url=$2 ;;
    --bin-dir) bin_dir=$2 ;;
    --service) service=$2 ;;
    --slots|--cpus|--memory-mb|--pids|--tmp-mb|--work-dir|--engine|--build|--build-timeout-seconds|--cleaner-image) settings="$settings $1 $(word "$2")" ;;
    *) fail "unknown option $1; give --token pbr_once_..., and optionally --url, --api-path, --binary-url, --bin-dir, --service true|false and the runner's settings" ;;
  esac
  shift 2
done

[ -n "$token" ] || fail "give the runner's one-time registration token: --token pbr_once_..."
case "$service" in true | false) ;; *) fail "--service is true or false" ;; esac

[ "$(uname -s)" = Linux ] || fail "the runner runs on Linux only, not $(uname -s)"
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "no runner is built for $(uname -m); there are x86_64 and arm64 ones" ;;
esac
[ -n "$binary_url" ] || binary_url="${runnerReleases}/v\${version}/protobase-runner-linux-\${arch}"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless; then
    echo "Docker runs as root here, so a job that escaped its container would be root on this machine: rootless Docker is recommended." >&2
  fi
elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
  if [ "$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" != true ]; then
    echo "Podman runs as root here, so a job that escaped its container would be root on this machine: rootless Podman is recommended." >&2
  fi
else
  fail "neither docker nor podman works for $(id -un); install one, rootless is recommended, and run this again"
fi

mkdir -p "$bin_dir"
runner="$bin_dir/protobase-runner"
echo "Downloading $binary_url"
curl -fsSL "$binary_url" -o "$runner.download" || fail "could not download $binary_url"
chmod 755 "$runner.download"
mv "$runner.download" "$runner"

eval "set -- $settings"
"$runner" register --url "$url" --api-path "$api_path" --token "$token" "$@"

if [ "$service" = false ]; then
  echo "Installed. Start it with: $runner run"
  exit 0
fi

systemctl --user show-environment >/dev/null 2>&1 || fail "systemctl --user does not work here; start the runner yourself with: $runner run"
units="\${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$units"
{
  echo '[Unit]'
  echo "Description=Protobase runner for $url"
  echo 'After=network-online.target'
  echo 'Wants=network-online.target'
  echo
  echo '[Service]'
  echo "ExecStart=$runner run"
  echo "Environment=PATH=$PATH"
  [ -z "\${DOCKER_HOST:-}" ] || echo "Environment=DOCKER_HOST=$DOCKER_HOST"
  [ -z "\${XDG_CONFIG_HOME:-}" ] || echo "Environment=XDG_CONFIG_HOME=$XDG_CONFIG_HOME"
  # Stopping waits for the jobs to clean up, up to 90 seconds
  echo 'TimeoutStopSec=120'
  echo 'Restart=always'
  echo 'RestartSec=5'
  echo
  echo '[Install]'
  echo 'WantedBy=default.target'
} >"$units/protobase-runner.service"
systemctl --user daemon-reload
systemctl --user enable --now protobase-runner.service
if ! loginctl show-user "$(id -un)" -p Linger 2>/dev/null | grep -q yes; then
  echo "To keep the runner running while you are logged out: loginctl enable-linger $(id -un)" >&2
fi
echo "Installed and started: systemctl --user status protobase-runner"
`

/**
 * `GET .../runners/install.sh`, public: the install script for this app, at the address it is served at (`app`, from
 * the request), and its own version.
 */
export const installRoute = (app: (request: Request) => RunnerApp) => {
  const route = new Hono()
  route.get('/', (c) => c.body(installScript(app(c.req.raw), protobaseVersion), 200, { 'content-type': 'text/x-shellscript; charset=utf-8', 'cache-control': 'no-store' }))
  return route
}
