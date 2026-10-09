import type { UsersApi } from './commands'

export type Confirm = (question: string) => Promise<string>

// Destructive commands need the email typed back, unless --yes. The last-admin guards live in the server functions.
export const deleteUserCommand = async (
  api: UsersApi,
  options: { email: string; yes: boolean },
  confirm: Confirm,
  out: (text: string) => void,
) => {
  if (!options.yes) {
    const typed = (await confirm(`This permanently deletes ${options.email}. Type the email to confirm: `)).trim()
    if (typed !== options.email) throw new Error('The typed email does not match; nothing was deleted')
  }
  await api.deleteUser(options.email)
  out(`Deleted ${options.email}\n`)
}

export const setRoleCommand = async (api: UsersApi, options: { email: string; role: string }, out: (text: string) => void) => {
  const user = await api.setUserRole(options)
  out(`${user.email} is now ${user.role}\n`)
}

// Disabling bans the user and revokes their sessions; tokens already issued expire within their lifetime.
export const setDisabledCommand = async (
  api: UsersApi,
  options: { email: string; disabled: boolean },
  out: (text: string) => void,
) => {
  await api.setUserBanned({ email: options.email, banned: options.disabled })
  out(
    options.disabled
      ? `Disabled ${options.email}: sessions revoked; tokens already issued stop working within 15 minutes\n`
      : `Enabled ${options.email}\n`,
  )
}
