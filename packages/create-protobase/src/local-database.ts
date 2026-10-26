/** The port a new project's Postgres takes when it is free, as in the presets' .env.example: one beside a local 5432. */
export const defaultPort = 55432

/** The scripts a new project starts and stops its Postgres with, from the docker-compose.yml that composeFile writes. */
export const databaseScripts = {
  'db:up': 'docker compose up -d --wait',
  'db:down': 'docker compose down',
}

/**
 * A docker-compose.yml with one Postgres 18 for the database, role and password of `databaseUrl`, published on its port
 * and kept in a volume. Compose names the project, and so the volume, after the folder.
 */
export const composeFile = (databaseUrl: URL) => {
  const user = decodeURIComponent(databaseUrl.username)
  const database = databaseUrl.pathname.slice(1)
  return `# The app's Postgres for development: \`bun run db:up\` starts it and \`bun run db:down\` stops it. The pgdata volume
# keeps the data; \`docker compose down -v\` removes it.
services:
  postgres:
    image: postgres:18
    ports:
      - '${databaseUrl.port}:5432'
    environment:
      POSTGRES_USER: ${user}
      POSTGRES_PASSWORD: ${decodeURIComponent(databaseUrl.password)}
      POSTGRES_DB: ${database}
    shm_size: 1gb
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${user} -d ${database}']
      interval: 2s
      timeout: 3s
      retries: 30

volumes:
  pgdata:
`
}
