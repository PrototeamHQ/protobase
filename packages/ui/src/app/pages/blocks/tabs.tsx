import { Fragment } from 'react'
import type { BlockProps } from './block-props'
import { cn } from '../../../lib/cn'
import { Link, useRouter } from '../../router'
import { shownPageTab, tabsOf, usePageTabsRoute } from '../page-tabs'
import { Problem } from '../problem'
import { text } from '../messages'

/**
 * The page's tabs, each a link to its own address, and the shown tab alone (its children are the tabs, one each, in
 * order), so the others load nothing. On a phone they are a select. A name the page has no tab for, such as one the
 * user may not see, says so under the tabs.
 */
export const TabsBlock = ({ node, children }: BlockProps) => {
  const { tab: named, pathOf } = usePageTabsRoute()
  const { navigate } = useRouter()
  const tabs = tabsOf(node)
  const shown = shownPageTab(tabs, named)
  // The first tab is at the page's own address
  const path = (name: string) => pathOf(name === tabs[0]?.name ? undefined : name)
  return (
    <div className="flex flex-col gap-6">
      <select aria-label={text('tabs')} value={shown?.name ?? ''} onChange={(event) => navigate(path(event.target.value))} className="h-9 rounded-md border border-border-strong bg-background px-2 font-medium md:hidden">
        {!shown && <option value="" disabled />}
        {tabs.map((tab) => (
          <option key={tab.name} value={tab.name}>
            {tab.label}
          </option>
        ))}
      </select>
      <nav aria-label={text('tabs')} className="hidden border-b md:block">
        <ul className="flex gap-1">
          {tabs.map((tab) => (
            <li key={tab.name}>
              <Link
                to={path(tab.name)}
                aria-current={tab === shown ? 'page' : undefined}
                className={cn('-mb-px inline-flex h-9 items-center whitespace-nowrap border-b-2 px-3 font-medium transition-colors', tab === shown ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {shown ? <Fragment key={shown.name}>{children[tabs.indexOf(shown)]}</Fragment> : <Problem>{text('noTab', named ?? '')}</Problem>}
    </div>
  )
}

/** One tab's elements, stacked as on the page. */
export const TabBlock = ({ children }: BlockProps) => <div className="flex flex-col gap-6">{children}</div>
