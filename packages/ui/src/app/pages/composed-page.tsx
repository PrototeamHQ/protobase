import { Notice, useAdminMeta } from '../meta-gate'
import { RenderNode } from './render-node'

/** `/<page>`: the page's tree as `/meta` gave it to this user. */
export const ComposedPage = ({ name }: { name: string }) => {
  const page = useAdminMeta().pages[name]
  if (!page) return <Notice title="Not found">There is no page called {name}.</Notice>
  return <RenderNode node={page.tree} />
}
