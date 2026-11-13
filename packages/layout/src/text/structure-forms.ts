import { evaluateCondition, parseCondition } from '../condition'
import { headed, titleOf } from './headed'
import { escapeMarkdown, heading } from './markdown'
import { recordValue } from './record-value'
import { childrenText, type TextForm } from './text-form'

// Text forms of the blocks that frame what they hold: a page, a card, a tab, a condition, and the blocks that load
// their own data, which read as their heading.

const Page: TextForm = (context) => headed(context, 1, titleOf(context), context.children)

const Card: TextForm = (context) => headed(context, 3, titleOf(context), context.children)

const Tab: TextForm = (context) => headed(context, 2, escapeMarkdown(String(context.node.props.label)), context.children)

// With a record, what a condition hides is left out; without one, nothing says whether it holds, so all of it reads
const Show: TextForm = (context) => {
  const { record } = context.options
  if (!record) return childrenText(context)
  const when = String(context.node.props.when)
  const condition = parseCondition(when)
  if (!condition.ok) throw new Error(`<Show when="${when}">: ${condition.message}`)
  const values = Object.fromEntries(condition.paths.map((path) => [path, recordValue(record, path)]))
  return evaluateCondition(condition, values) ? childrenText(context) : ''
}

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

export const structureForms: Record<string, TextForm> = { Page, Card, Tab, Show, ...ownDataForms }
