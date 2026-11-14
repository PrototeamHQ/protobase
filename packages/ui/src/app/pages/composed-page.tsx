import { appPath } from '@protobase/schema'
import { Notice, useAdminMeta } from '../meta-gate'
import { RevealWhenLoaded } from '../reveal-when-loaded'
import { RenderNode } from './render-node'
import { PageParamsProvider, pageAddress } from './page-params'
import { PageTabsProvider } from './page-tabs'
import { text } from './messages'

/**
 * `/<page>`, and `/<page>/<tab>` for one of its tabs, with its parameters in the query: the page's tree as `/meta` gave
 * it to this user, shown once its parts have their first data.
 */
export const ComposedPage = ({ name, tab, params }: { name: string; tab?: string; params?: Readonly<Record<string, string>> }) => {
  const page = useAdminMeta().pages[name]
  if (!page) return <Notice title={text('notFound')}>{text.rich('noPage', { page: name })}</Notice>
  // A tab keeps the page's parameters, as its SelectInputs above the tabs hold them
  const pathOf = (shown: string | undefined) => appPath(pageAddress({ page: name, ...(shown && { tab: shown }), given: params ?? {} }))
  return (
    <PageTabsProvider route={{ ...(tab && { tab }), pathOf }}>
      <PageParamsProvider page={name} {...(tab && { tab })} tree={page.tree} {...(params && { given: params })}>
        <RevealWhenLoaded>
          <RenderNode node={page.tree} />
        </RevealWhenLoaded>
      </PageParamsProvider>
    </PageTabsProvider>
  )
}
