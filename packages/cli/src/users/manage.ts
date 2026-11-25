import { everyOrganization, type EveryOrganization } from '@protobase/query'
import { checkPinnedUser, pinLine, resolveOptionalPin, type PinOptions } from '../organizations/pin'
import type { UsersApi } from './commands'

export type Confirm = (question: string) => Promise<string>

// These change the user's whole account, in every organization they belong to; with organizations, the pin decides
// whom they can reach: a member of the pinned organization, or any user with --all-organizations.
const reachUser = async (api: UsersApi, options: PinOptions & { email: string }, command: string, wide: () => EveryOrganization, out: (text: string) => void) => {
  const pin = await resolveOptionalPin(api, options, command, wide)
  if (!pin) return
  await checkPinnedUser(api, pin, options.email)
  out(pinLine(pin))
}

// Destructive commands need the email typed back, unless --yes. The last-admin guards live in the server functions.
export const deleteUserCommand = async (
  api: UsersApi,
  options: PinOptions & { email: string; yes: boolean },
  confirm: Confirm,
  out: (text: string) => void,
) => {
  await reachUser(api, options, 'users delete', () => everyOrganization('protobase users delete: --all-organizations'), out)
  if (!options.yes) {
    const typed = (await confirm(`This permanently deletes ${options.email}. Type the email to confirm: `)).trim()
    if (typed !== options.email) throw new Error('The typed email does not match; nothing was deleted')
  }
  await api.deleteUser(options.email)
  out(`Deleted ${options.email}\n`)
}

export const setRoleCommand = async (api: UsersApi, options: PinOptions & { email: string; role: string }, out: (text: string) => void) => {
  await reachUser(api, options, 'users set-role', () => everyOrganization('protobase users set-role: --all-organizations'), out)
  const user = await api.setUserRole({ email: options.email, role: options.role })
  out(`${user.email} is now ${user.role}\n`)
}

// Disabling bans the user and revokes their sessions; tokens already issued expire within their lifetime.
export const setDisabledCommand = async (
  api: UsersApi,
  options: PinOptions & { email: string; disabled: boolean },
  out: (text: string) => void,
) => {
  const command = options.disabled ? 'users disable' : 'users enable'
  await reachUser(api, options, command, () => everyOrganization(options.disabled ? 'protobase users disable: --all-organizations' : 'protobase users enable: --all-organizations'), out)
  await api.setUserBanned({ email: options.email, banned: options.disabled })
  out(
    options.disabled
      ? `Disabled ${options.email}: sessions revoked; tokens already issued stop working within 15 minutes\n`
      : `Enabled ${options.email}\n`,
  )
}
