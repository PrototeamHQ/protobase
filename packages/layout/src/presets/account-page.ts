import { ConnectedAccounts, ConnectedApps, DeleteAccount, Devices, Page, Passkeys, Password, Profile, Tab, Tabs, TwoFactor } from '../blocks'
import { accountPageName } from '../check-account'
import { page } from '../page'

/**
 * The standard tabs of the account page, by name, for an account page of the app's own: list the ones to keep, in
 * the order to show them, beside tabs of its own. Written as calls rather than JSX, as `usersPage` is.
 */
export const accountTabs = {
  profile: Tab({ name: 'profile', label: 'Profile', children: [Profile({}), DeleteAccount({})] }),
  security: Tab({ name: 'security', label: 'Sign-in & security', children: [Password({}), Passkeys({}), TwoFactor({}), ConnectedAccounts({})] }),
  devices: Tab({ name: 'devices', label: 'Devices', children: [Devices({})] }),
  apps: Tab({ name: 'apps', label: 'Connected apps', children: [ConnectedApps({})] }),
}

/**
 * The account page everyone signed in has at `/-/account`, each tab below it (`/-/account/security`). The server
 * serves it when the config exports no page named `account`; exporting one replaces it.
 */
export const accountPage = page(accountPageName, Page({ title: 'Account', children: Tabs({ children: Object.values(accountTabs) }) }))
