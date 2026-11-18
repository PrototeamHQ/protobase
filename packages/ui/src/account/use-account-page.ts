import { useMemo } from 'react'
import { useAuth } from '../auth/auth-provider'
import { useAdminMeta } from '../app/meta-gate'
import { shownAccountTree } from './account-tree'
import { linkableProviders } from './blocks/connected-accounts-block'

/**
 * The signed-in person's account page as `/meta` gave it to them, the app's own or the standard one, without the
 * account blocks that have nothing to show here and the tabs they leave empty; `undefined` when `/meta` has none.
 */
export const useAccountPage = () => {
  const { account } = useAdminMeta()
  const auth = useAuth()
  const { mcp, personalAccessTokens, accountDeletion } = auth
  const linkable = linkableProviders(auth).length > 0
  const mailboxes = auth.personalMail.length > 0
  return useMemo(() => {
    if (!account) return undefined
    const hidden = new Set([...(mcp ? [] : ['ConnectedApps']), ...(personalAccessTokens ? [] : ['PersonalAccessTokens']), ...(linkable ? [] : ['ConnectedAccounts']), ...(mailboxes ? [] : ['PersonalMail']), ...(accountDeletion ? [] : ['DeleteAccount'])])
    return { ...account, tree: shownAccountTree(account.tree, hidden) }
  }, [account, mcp, personalAccessTokens, linkable, mailboxes, accountDeletion])
}
