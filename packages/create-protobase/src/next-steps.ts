/**
 * What to run in a new project, from `cwd`'s point of view, until its admin app serves. `scripts` are those of the
 * project's package.json: a preset with a base seed loads it, and one with sample data offers it, before the first user,
 * who then owns the organizations the seeds wrote.
 */
export const nextSteps = (dir: string, scripts: Record<string, string>) =>
  [
    `cd ${dir}`,
    'bun install',
    'cp .env.example .env   # then set DATABASE_URL and BETTER_AUTH_SECRET',
    'bun run db:migrate',
    ...('db:seed:base' in scripts ? ['bun run db:seed:base'] : []),
    ...('db:seed' in scripts ? ['bun run db:seed --scale small   # optional: sample data, replacing the app tables'] : []),
    'bun run protobase users create you@example.com --generate-password',
    'bun run dev            # http://localhost:5173',
  ]
    .map((line) => `  ${line}\n`)
    .join('')
