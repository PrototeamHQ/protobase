/** Whether the commands the next steps run are on PATH. */
export type Tools = { bun: boolean; docker: boolean }

/**
 * What to run in a new project, from `cwd`'s point of view, until its admin app serves. `scripts` are those of the
 * project's package.json: a preset with a base seed loads it, and one with sample data offers it, before the first user,
 * who then owns the organizations the seeds wrote. Without Docker, the database is one of the user's own; without Bun,
 * which runs every script, installing it comes first.
 */
export const nextSteps = (dir: string, scripts: Record<string, string>, port: number, tools: Tools) => {
  const steps = [
    `cd ${dir}`,
    'bun install',
    tools.docker
      ? `bun run db:up          # Postgres 18 in Docker on port ${port}`
      : '# no Docker found: set DATABASE_URL in .env to a Postgres database of yours',
    'bun run db:migrate',
    ...('db:seed:base' in scripts ? ['bun run db:seed:base'] : []),
    ...('db:seed' in scripts ? ['bun run db:seed --scale small   # optional: sample data, replacing the app tables'] : []),
    'bun run protobase users create you@example.com --generate-password',
    'bun run dev            # http://localhost:5173',
  ]
  const lines = steps.map((line) => `  ${line}\n`).join('')
  if (tools.bun) return lines
  return `Bun 1.4 runs the project's scripts: install it first (https://bun.sh).\n\n${lines}`
}
