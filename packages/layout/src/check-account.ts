import type { LayoutNode } from './node'
import { walkTree } from './walk'

/** The page that holds the signed-in person's own account. */
export const accountPageName = 'account'

/** The blocks that act on the signed-in person's own sign-in, so they belong on the account page alone. */
export const accountBlocks: ReadonlySet<string> = new Set(['Profile', 'Password', 'Passkeys', 'TwoFactor', 'ConnectedAccounts', 'PersonalMail', 'Devices', 'ConnectedApps', 'DeleteAccount'])

/** Each account block on a page other than the account page, with where it is. */
export const accountBlockProblems = (name: string, tree: LayoutNode): string[] => {
  if (name === accountPageName) return []
  const problems: string[] = []
  walkTree(tree, (node, { path }) => {
    if (!node.custom && accountBlocks.has(node.type)) problems.push(`${path}: <${node.type}> acts on the signed-in person's own account, so it is only allowed on the "${accountPageName}" page`)
  })
  return problems
}
