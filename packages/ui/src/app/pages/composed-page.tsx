import { Notice, useAdminMeta } from '../meta-gate'
import { RenderNode } from './render-node'
import { text } from './messages'
import { slotted } from '../../locale/slotted'

/** `/<page>`: the page's tree as `/meta` gave it to this user. */
export const ComposedPage = ({ name }: { name: string }) => {
  const page = useAdminMeta().pages[name]
  if (!page) return <Notice title={text('notFound')}>{slotted(text('noPage'), name)}</Notice>
  return <RenderNode node={page.tree} />
}
