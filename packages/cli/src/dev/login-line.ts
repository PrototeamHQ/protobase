// How the project runs its own `protobase`, by the package manager that started `protobase dev` (its
// npm_config_user_agent, such as "bun/1.4.2 npm/? node/v22 darwin arm64"); npx otherwise.
const runners: Record<string, string> = { bun: 'bun run protobase', pnpm: 'pnpm protobase', yarn: 'yarn protobase', npm: 'npx protobase' }

export const protobaseCommand = (userAgent: string | undefined) => runners[userAgent?.split('/')[0] ?? ''] ?? 'npx protobase'

/**
 * The banner's sign-in line: with an empty auth store, the exact command that creates the first admin, since nobody can
 * sign in until it runs. `anyUsers` is undefined when the project has no auth store the users commands manage.
 */
export const loginLine = (anyUsers: boolean | undefined, userAgent: string | undefined) => {
  if (anyUsers === undefined) return ''
  const protobase = protobaseCommand(userAgent)
  const create = `${protobase} users create you@example.com --generate-password`
  if (!anyUsers) return `  login    no users yet; create the first admin with:\n             ${create}\n`
  return `  login    sign in as one of its users (\`${protobase} users list\`), or add one: ${create}\n`
}
