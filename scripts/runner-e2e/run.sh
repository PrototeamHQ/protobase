#!/usr/bin/env bash
# The runner's end-to-end test, on a Linux test machine with rootless Docker reached over ssh, never this one:
#
#   scripts/runner-e2e/run.sh [host]        (host defaults to dev1)
#
# It copies the branch as it stands, uncommitted changes and new files included but nothing git ignores, into a new
# folder ~/pb-runner-e2e-<stamp> there and runs remote.sh in it, which removes the folder and everything it made there on
# exit. Then it lists what is left there, to check that nothing of the test is.
set -euo pipefail

host=${1:-dev1}
folder=pb-runner-e2e-$(date +%s)
repo=$(git rev-parse --show-toplevel)
cd "$repo"

echo "== copying the branch to $host:~/$folder"
git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' file; do [ -e "$file" ] && printf '%s\0' "$file"; done |
  COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -czf - |
  ssh -o BatchMode=yes "$host" "mkdir ~/$folder ~/$folder/repo && tar --warning=no-unknown-keyword -xzf - -C ~/$folder/repo"

# Stopped here, the test there is stopped too, and its cleanup runs.
trap 'ssh -o BatchMode=yes "$host" "pkill -TERM -f $folder/" || true' INT TERM
status=0
ssh -o BatchMode=yes "$host" "sh ~/$folder/repo/scripts/runner-e2e/remote.sh" || status=$?
trap - INT TERM

echo "== left on $host"
ssh -o BatchMode=yes "$host" 'docker ps -a; docker image ls; ls -la ~'
exit "$status"
