import { Notice } from '../app/meta-gate'
import { PageTabsProvider } from '../app/pages/page-tabs'
import { RenderNode } from '../app/pages/render-node'
import { accountTabPath } from './account-pages'
import { text } from './messages'
import { useAccountPage } from './use-account-page'

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
