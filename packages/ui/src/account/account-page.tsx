import { useMemo } from 'react'
import { useAuth } from '../auth/auth-provider'
import { Notice, useAdminMeta } from '../app/meta-gate'
import { PageTabsProvider } from '../app/pages/page-tabs'
import { RenderNode } from '../app/pages/render-node'
import { accountTabPath } from './account-pages'
import { shownAccountTree } from './account-tree'
import { linkableProviders } from './blocks/connected-accounts-block'
import { text } from './messages'

/**
 * The signed-in person's account page as `/meta` gave it to them, the app's own or the standard one, without the
 * account blocks that have nothing to show here and the tabs they leave empty; `undefined` when `/meta` has none.
 */
export const useAccountPage = () => {
  const { account } = useAdminMeta()
  const auth = useAuth()
  const { mcp } = auth
  const linkable = linkableProviders(auth).length > 0
  return useMemo(() => {
    if (!account) return undefined
    const hidden = new Set([...(mcp ? [] : ['ConnectedApps']), ...(linkable ? [] : ['ConnectedAccounts'])])
    return { ...account, tree: shownAccountTree(account.tree, hidden) }
  }, [account, mcp, linkable])
}

/** `/-/account`, and `/-/account/<tab>` for one of its tabs: the signed-in person's account page. */
export const AccountPage = ({ tab }: { tab?: string }) => {
  const page = useAccountPage()
  if (!page) return <Notice title={text('noAccount')}>{text('noAccountDescription')}</Notice>
  return (
    <PageTabsProvider route={{ ...(tab && { tab }), pathOf: accountTabPath }}>
      <RenderNode node={page.tree} />
    </PageTabsProvider>
  )
}
