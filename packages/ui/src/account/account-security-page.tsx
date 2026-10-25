import { PageHeader } from '../app-shell'
import { ConnectedAccountsBlock } from './blocks/connected-accounts-block'
import { ConnectedAppsBlock } from './blocks/connected-apps-block'
import { PasskeysBlock } from './blocks/passkeys-block'
import { TwoFactorBlock } from './blocks/two-factor-block'
import { text } from './messages'

/**
 * The signed-in person's passkeys, two-factor authentication and connected accounts, within what the sign-in policy
 * allows, and with MCP on the apps they allowed to act as them. Each is an account block that reads its own data.
 */
export const AccountSecurityPage = ({ email }: { email: string }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
    <PageHeader title={text('signInSecurity')} subtitle={email} />
    <PasskeysBlock />
    <TwoFactorBlock />
    <ConnectedAccountsBlock />
    <ConnectedAppsBlock />
  </div>
)
