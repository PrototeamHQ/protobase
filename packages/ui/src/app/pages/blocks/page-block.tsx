import type { PageProps } from '@protobase/layout'
import { PageHeader } from '../../../app-shell'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

export const PageBlock = ({ node, children, slots }: BlockProps) => {
  const { title, description, width } = propsOf<PageProps>(node)
  return (
    <div className="flex-1">
      <div className={cn('flex flex-col gap-6 px-4 pb-16 pt-6 md:px-10 md:py-8', width !== 'full' && 'mx-auto max-w-[1200px]')}>
        <PageHeader title={title} subtitle={description} actions={slots.actions} />
        {children}
      </div>
    </div>
  )
}
