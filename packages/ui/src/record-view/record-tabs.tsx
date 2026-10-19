import type { AppAddress } from '@protobase/schema'
import { cn } from '../lib/cn'
import { AppLink } from '../app/use-app-address'
import { segmentedClass } from '../primitives/segmented'
import { text } from './messages'

/** The record page's tabs, links whose addresses show each; the shown one is the current page. */
export const RecordTabs = ({ tabs }: { tabs: Array<{ title: string; to: AppAddress; current: boolean }> }) => (
  // One line of tabs scrolls sideways on a narrow screen, which the page cannot do for it
  <nav aria-label={text('tabs')} className="overflow-x-auto py-6">
    <span className={segmentedClass.group('md')}>
      {tabs.map((tab) => (
        <AppLink key={tab.title} to={tab.to} replace aria-current={tab.current ? 'page' : undefined} className={cn(segmentedClass.option(tab.current, 'md'), 'whitespace-nowrap')}>
          {tab.title}
        </AppLink>
      ))}
    </span>
  </nav>
)
