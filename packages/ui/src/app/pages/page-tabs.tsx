import { createContext, useContext, type ReactNode } from 'react'
import type { LayoutNode, TabProps } from '@protobase/layout'

/** Where a page's tabs are: the one the address names, if any, and the path below the base path that shows each tab. */
export type PageTabsRoute = { tab?: string; pathOf: (tab: string | undefined) => string }

const PageTabsContext = createContext<PageTabsRoute | null>(null)

export const PageTabsProvider = ({ route, children }: { route: PageTabsRoute; children: ReactNode }) => <PageTabsContext.Provider value={route}>{children}</PageTabsContext.Provider>

export const usePageTabsRoute = () => {
  const route = useContext(PageTabsContext)
  if (!route) throw new Error('Tabs render inside a page that gives them their addresses: a composed page')
  return route
}

/** The tabs of a `Tabs` element, as the server sent them to this user. */
export const tabsOf = (tabs: LayoutNode) => tabs.children.filter((child): child is LayoutNode => typeof child !== 'string').map((node) => ({ node, ...(node.props as unknown as TabProps) }))

/** The tabs of a page's tree: those of its `Tabs`, which sits directly in its `Page`; none without one. */
export const pageTabs = (tree: LayoutNode) => {
  const tabs = tree.children.find((child): child is LayoutNode => typeof child !== 'string' && !child.custom && child.type === 'Tabs')
  return tabs ? tabsOf(tabs) : []
}

/** The tab shown: the one `named`, else the first when none is named; none for a name the page has no tab for. */
export const shownPageTab = <T extends { name: string }>(tabs: T[], named: string | undefined) => (named === undefined ? tabs[0] : tabs.find((tab) => tab.name === named))
