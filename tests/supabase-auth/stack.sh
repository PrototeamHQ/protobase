#!/usr/bin/env bash
# Supabase's Postgres image with its own init, so `auth` is owned as on a Supabase project (the schema by
# supabase_admin, its tables by supabase_auth_admin, no CREATE on it for postgres), and Supabase Auth on it, which
# migrates `auth` as supabase_auth_admin. For tests/supabase-auth/: `stack.sh start <name>` prints the variables the
# test reads, as NAME=value lines; `stack.sh stop <name>` removes both containers and their network.
set -euo pipefail

action=${1:?start or stop}
name=${2:?a name for the containers}
postgres_image=supabase/postgres:17.11.0.006
auth_image=supabase/gotrue:v2.197.0
password=protobase
jwt_secret=supabase-auth-test-jwt-secret-at-least-32-characters

if [ "$action" = stop ]; then
  docker rm --force "$name-auth" "$name-db" > /dev/null 2>&1 || true
  docker network rm "$name" > /dev/null 2>&1 || true
  exit 0
fi

docker network create "$name" > /dev/null
docker run --detach --rm --name "$name-db" --network "$name" --publish 5432 -e POSTGRES_PASSWORD="$password" "$postgres_image" > /dev/null
until docker exec "$name-db" pg_isready -U supabase_admin -d postgres -h 127.0.0.1 -q; do sleep 2; done
# The image's init restarts the server once it is done; wait until it answers queries for good.
until docker exec "$name-db" psql -U supabase_admin -d postgres -h 127.0.0.1 -tAc 'select 1' > /dev/null 2>&1; do sleep 2; done
docker exec "$name-db" psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q \
  -c "alter role supabase_auth_admin password '$password'" -c "alter role postgres password '$password'"

docker run --detach --rm --name "$name-auth" --network "$name" --publish 9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://localhost:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$password@$name-db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_JWT_SECRET="$jwt_secret" -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false \
  "$auth_image" > /dev/null
db_port=$(docker port "$name-db" 5432/tcp | head -n1 | sed 's/.*://')
auth_port=$(docker port "$name-auth" 9999/tcp | head -n1 | sed 's/.*://')
for _ in $(seq 60); do
  curl --silent --fail "http://localhost:$auth_port/health" > /dev/null && break
  sleep 2
done
curl --silent --fail "http://localhost:$auth_port/health" > /dev/null

echo "TEST_SUPABASE_STACK_URL=postgres://supabase_admin:$password@localhost:$db_port/postgres"
echo "TEST_SUPABASE_AUTH_URL=http://localhost:$auth_port"
echo "TEST_SUPABASE_AUTH_JWT_SECRET=$jwt_secret"
