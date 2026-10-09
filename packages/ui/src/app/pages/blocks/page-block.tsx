import type { PageProps } from '@protobase/layout'
import { PageHeader } from '../../../app-shell'
import { propsOf, type BlockProps } from './block-props'

export const PageBlock = ({ node, children, slots }: BlockProps) => {
  const { title, description } = propsOf<PageProps>(node)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-6 md:px-10 md:py-8">
        <PageHeader title={title} subtitle={description} actions={slots.actions} />
        {children}
      </div>
    </div>
  )
}
