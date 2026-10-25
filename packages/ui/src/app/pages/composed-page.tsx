import { appPath } from '@protobase/schema'
import { Notice, useAdminMeta } from '../meta-gate'
import { RenderNode } from './render-node'
import { PageTabsProvider } from './page-tabs'
import { text } from './messages'
import { slotted } from '../../locale/slotted'

/** `/<page>`, and `/<page>/<tab>` for one of its tabs: the page's tree as `/meta` gave it to this user. */
export const ComposedPage = ({ name, tab }: { name: string; tab?: string }) => {
  const page = useAdminMeta().pages[name]
  if (!page) return <Notice title={text('notFound')}>{slotted(text('noPage'), name)}</Notice>
  const pathOf = (shown: string | undefined) => appPath({ kind: 'page', page: name, ...(shown && { tab: shown }) })
  return (
    <PageTabsProvider route={{ ...(tab && { tab }), pathOf }}>
      <RenderNode node={page.tree} />
    </PageTabsProvider>
  )
}
