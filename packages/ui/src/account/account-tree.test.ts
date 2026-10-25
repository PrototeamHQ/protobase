import { describe, expect, it } from 'vitest'
import { accountPage, accountTabs, ConnectedApps, Page, Tab, Tabs, type LayoutNode } from '@protobase/layout'
import { shownAccountTree } from './account-tree'

const tabNames = (tree: LayoutNode) => (tree.children[0] as LayoutNode).children.map((tab) => (tab as LayoutNode).props.name)

describe('shownAccountTree', () => {
  it('keeps every tab when no block is hidden', () => {
    expect(tabNames(shownAccountTree(accountPage.toModel().tree, new Set()))).toEqual(['profile', 'security', 'devices', 'apps'])
  })

  it('leaves out a hidden block, and the tab it leaves empty', () => {
    const tree = shownAccountTree(accountPage.toModel().tree, new Set(['ConnectedApps', 'ConnectedAccounts']))
    expect(tabNames(tree)).toEqual(['profile', 'security', 'devices'])
    expect(((tree.children[0] as LayoutNode).children[1] as LayoutNode).children.map((block) => (block as LayoutNode).type)).toEqual(['Password', 'Passkeys', 'TwoFactor'])
  })

  it('keeps a tab that holds more than the hidden block', () => {
    const tree = Page({ title: 'Account', children: Tabs({ children: [accountTabs.profile, Tab({ name: 'apps', label: 'Apps', children: ['Apps acting as you.', ConnectedApps({})] })] }) })
    expect(tabNames(shownAccountTree(tree, new Set(['ConnectedApps'])))).toEqual(['profile', 'apps'])
  })
})
