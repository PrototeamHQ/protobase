/** What to run in a new project, from `cwd`'s point of view, until its admin app serves. */
export const nextSteps = (dir: string) =>
  [
    `cd ${dir}`,
    'bun install',
    'cp .env.example .env   # then set DATABASE_URL and BETTER_AUTH_SECRET',
    'bun run db:migrate',
    'bun run protobase users create you@example.com --generate-password',
    'bun run dev            # http://localhost:5173',
  ]
    .map((line) => `  ${line}\n`)
    .join('')
