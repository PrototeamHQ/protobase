import { headed, titleOf } from './headed'
import { escapeMarkdown, heading } from './markdown'
import { type TextForm } from './text-form'

// Text forms of the blocks that frame what they hold: a page, a card, a tab, a condition, and the blocks that load
// their own data, which read as their heading.

const Page: TextForm = (context) => headed(context, 1, titleOf(context), context.children)

const Card: TextForm = (context) => headed(context, 3, titleOf(context), context.children)

const Tab: TextForm = (context) => headed(context, 2, escapeMarkdown(String(context.node.props.label)), context.children)

// The blocks that load the signed-in person's own data, read as the heading the web shows them under
const ownDataTitles: Record<string, string> = {
  Users: 'Users',
  Profile: 'Profile',
  Password: 'Password',
  Passkeys: 'Passkeys',
  TwoFactor: 'Two-factor authentication',
  ConnectedAccounts: 'Connected accounts',
  PersonalMail: 'Mailbox',
  Connections: 'Connections',
  Devices: 'Devices',
  ConnectedApps: 'Connected apps',
  PersonalAccessTokens: 'Access tokens',
  DeleteAccount: 'Delete account',
}

const ownDataForms = Object.fromEntries(Object.entries(ownDataTitles).map(([type, title]): [string, TextForm] => [type, () => heading(3, title)]))

export const structureForms: Record<string, TextForm> = { Page, Card, Tab, ...ownDataForms }
