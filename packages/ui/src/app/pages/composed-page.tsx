import { appPath } from '@protobase/schema'
import { Notice, useAdminMeta } from '../meta-gate'
import { RevealWhenLoaded } from '../reveal-when-loaded'
import { RenderNode } from './render-node'
import { PageTabsProvider } from './page-tabs'
import { text } from './messages'

/**
 * `/<page>`, and `/<page>/<tab>` for one of its tabs: the page's tree as `/meta` gave it to this user, shown once its
 * parts have their first data.
 */
export const ComposedPage = ({ name, tab }: { name: string; tab?: string }) => {
  const page = useAdminMeta().pages[name]
  if (!page) return <Notice title={text('notFound')}>{text.rich('noPage', { page: name })}</Notice>
  const pathOf = (shown: string | undefined) => appPath({ kind: 'page', page: name, ...(shown && { tab: shown }) })
  return (
    <PageTabsProvider route={{ ...(tab && { tab }), pathOf }}>
      <RevealWhenLoaded>
        <RenderNode node={page.tree} />
      </RevealWhenLoaded>
    </PageTabsProvider>
  )
}
